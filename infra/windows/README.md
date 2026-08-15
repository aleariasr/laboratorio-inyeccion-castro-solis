# LICS para Windows — app de escritorio (sin modo kiosco)

Es la propuesta para que un colaborador instale un `.exe`, le aparezca un
ícono de "LICS" en el escritorio, lo abra como abriría Word o Excel, y quede
funcionando — sin terminal, sin navegador aparte, sin modo kiosco (la misma
computadora también se usa para Office).

**Validado en una Windows 11 real el 15/08/2026**: imagen dorada construida,
instalador `.exe` compilado por el runner self-hosted, instalado, primera
sesión creada, uso real de la app. En esa sesión de validación aparecieron
(y se arreglaron) varios bugs reales de `build-golden-image.ps1`,
`provision-golden-image.sh` y el workflow de Actions — están todos descritos
en `CHANGELOG.md`. Ver también **"Problema conocido: caídas intermitentes de
conexión"** más abajo — ese sí quedó parcialmente sin resolver (mitigado, no
curado).

---

## Decisión de arquitectura (ya conversada y confirmada)

Motor: **WSL2 + Ubuntu con Docker Engine real dentro**, no Docker Desktop.
Los scripts de `scripts/*.sh` de este repo se instalan sin cambios dentro de
esa distro. Lo único nuevo es la capa Windows: un instalador que prepara
WSL2, y una app de escritorio (Electron) que arranca/verifica los servicios
y muestra la interfaz web de LICS dentro de su propia ventana nativa.

Sin modo kiosco: la ventana es una ventana normal de Windows (con su barra de
título, se puede minimizar, mover, cerrar). Cerrarla **no apaga los
servicios** — Docker y PostgreSQL siguen corriendo dentro de WSL2 igual que
si cerrás Word y tu computadora sigue prendida. Volver a abrir el ícono de
LICS solo reconecta con lo que ya está corriendo (rápido) o lo arranca si
hacía falta (más lento, con una pantalla de "Iniciando…").

Respaldo automático aunque apaguen la compu de noche: no hace falta inventar
nada nuevo del lado Windows para esto. El timer que ya existe en
`infra/systemd/lics-backup.timer` tiene `Persistent=true`, que es exactamente
la semántica de systemd para "si la máquina estaba apagada a la hora
programada, ejecutar en cuanto vuelva a estar disponible". Como ese timer
corre *dentro* de WSL2 sin modificarse, este comportamiento ya viene gratis.
Lo único que hay que garantizar del lado Windows es que la distro WSL2
efectivamente arranque cada vez que la computadora se enciende — de eso se
encarga la tarea programada `register-scheduled-task.ps1` de más abajo.

Qué NO quedó expuesto como botón en la app: `restore.sh`, `rollback.sh` y
`update.sh`. Esos scripts piden confirmación escrita a propósito (escribir
`RESTORE lics` a mano) porque son operaciones destructivas — automatizarlas
detrás de un botón le quita el propósito a esa protección. Siguen siendo
procedimientos manuales por SSH, igual que hoy. La app solo expone lo que ya
es seguro repetir sin supervisión: iniciar, reiniciar, ver estado, backup
manual.

---

## Cómo se genera la imagen dorada y el instalador (un solo comando por máquina)

Sacar una versión nueva del `.exe` cruza dos computadoras distintas (donde se
compilan las imágenes de la app, típicamente un Mac, y esta Windows), así que
no hay forma de que sea un único comando sin infraestructura nueva de por
medio. Pero cada lado sí es un solo comando:

**En la máquina donde se compilan las imágenes** (requiere Docker con
`buildx`, ya construye `linux/amd64` aunque el host sea otra arquitectura):

```bash
./scripts/build-offline-release.sh
```

Genera `release/lics-<versión>-linux-amd64/`. Pasá esa carpeta a la Windows
(USB, red, lo que uses — no hay puente automático entre las dos máquinas para
este paso).

**En esta Windows**, con la carpeta de release ya copiada a `C:\lics-dev\`:

```powershell
cd wsl
.\cut-release.ps1
```

`cut-release.ps1` detecta sola la carpeta de release más nueva en
`C:\lics-dev\`, reconstruye la imagen dorada (`build-golden-image.ps1` por
dentro) y, si tenés `gh` (GitHub CLI) instalado y logueado, dispara el
workflow de Actions y se queda esperando hasta que el `.exe` esté listo. Sin
`gh`, hace igual la imagen dorada y te avisa que falta apretar "Run workflow"
a mano en GitHub.

Si preferís correr el paso de la imagen dorada por separado (por ejemplo para
reintentar sin repetir todo), `wsl/build-golden-image.ps1` sigue siendo el
script de fondo y se puede invocar directo:

```powershell
powershell -ExecutionPolicy Bypass -File wsl\build-golden-image.ps1 `
    -ReleaseDir "C:\ruta\a\lics-1.0.2-beta-linux-amd64" `
    -OutputPath "C:\lics-build\lics-wsl-rootfs.tar"
```

No usa `wsl --install` (ese camino puede abrir un asistente interactivo de
"creá tu usuario"); en cambio descarga el rootfs oficial de Ubuntu 24.04
directo de Canonical y lo importa con `wsl --import`, que nunca dispara
ningún asistente porque solo mueve un sistema de archivos. También reinicia
Windows solo si hace falta activar WSL2 por primera vez (se reanuda solo al
volver a iniciar sesión, vía una entrada `RunOnce` que él mismo se registra).

Adentro hace, en orden: habilita WSL2 (reinicia y se reanuda solo si hacía
falta) → descarga e importa Ubuntu 24.04 sin asistente → activa `systemd` y
usuario `root` por defecto dentro de la distro (reinicia solo la distro, eso
es instantáneo, no es el reinicio de Windows) → corre
`provision-golden-image.sh` (Docker Engine, copia la app, carga imágenes,
`.env.prod`, migraciones, instala `lics.service`/`lics-backup.timer`/
`lics-watchdog.timer` **sin tocar los dos primeros**, enmascara
`wsl-pro.service` — ver más abajo por qué —, valida `start.sh`/
`healthcheck.sh` tal cual están) → exporta el `.tar` final.

Lo único que de verdad no se puede automatizar, porque es un ajuste de
firmware y ningún software de Windows puede tocarlo: **activar la
virtualización en BIOS/UEFI**. Si no está activa, el script para con un
mensaje claro en vez de fallar a medias — eso seguís teniendo que hacerlo vos
a mano, una vez, antes de correr el script.

Con el `.tar` ya generado, dejalo en:

```
C:\lics-build\lics-wsl-rootfs.tar
```

(ya está listo `electron/build/icon.ico`, un placeholder con el nombre LICS —
reemplazalo cuando tengan un logo real).

### Compilar el `.exe`: GitHub Actions con runner self-hosted, no `windows-latest`

Un runner `windows-latest` de GitHub **no sirve acá**: el instalador final
incluye adentro toda la imagen de WSL2 (Ubuntu + Docker + la app + las 4
imágenes cargadas), que pesa varios GB. No hay forma sana de mover eso a
través de la nube de GitHub, y además esos runners no traen WSL2 utilizable
(soportan virtualización anidada desde 2024, pero activar WSL2 pide un
reinicio que un job de CI no puede dar).

La solución es registrar la misma PC Windows donde ya generaste el `.tar`
como **runner self-hosted** de GitHub Actions — el job corre en esa máquina,
el archivo ya está ahí, nada pesado viaja por internet. Seguís usando la
pestaña Actions de GitHub para dispararlo y bajar el instalador.

Una sola vez, en esa Windows: **Settings > Actions > Runners > New
self-hosted runner > Windows**, en tu repo de GitHub. Copiá y corré tal cual
los comandos que GitHub te genera ahí (traen un token único por repo, no los
copies de acá porque van a estar vencidos). Cuando `config.cmd` te pregunte
por labels adicionales, agregá `lics-windows`. Al final, en vez de correrlo
interactivo, instalalo como servicio de Windows para que quede siempre
disponible:

```powershell
.\svc.cmd install
.\svc.cmd start
```

Con el runner ya registrado y corriendo, agregá
`.github/workflows/build-windows-installer.yml` (ya te lo dejé armado en el
zip, en la raíz del repo, no dentro de `infra/windows/`). Cada vez que saques
una versión nueva: pestaña **Actions > build-windows-installer > Run
workflow**, y descargá `LICS-Setup` de los artefactos cuando termine.

Ojo, dos cosas:

- Esto compila el `.exe`. **No reemplaza** correr `build-golden-image.ps1` —
  ese paso sigue siendo manual, una sola vez (o cada vez que cambie la
  versión de la app y quieras refrescar la imagen dorada), porque implica un
  reinicio de Windows que un job de Actions no puede sobrevivir.
- Sin certificado de firma de código, Windows va a mostrar SmartScreen
  ("Windows protegió su PC") al instalar el `.exe` resultante — esperado,
  "Más información > Ejecutar de todas formas".
- **Nunca commitees el `.tar`** a git — agregá esto a `.gitignore`:
  ```
  infra/windows/electron/resources/windows/*.tar
  infra/windows/electron/dist/
  ```

---

## Instalación y primer uso (repetir en cada instalación nueva)

Con el `.exe` (artefacto `LICS-Setup` de Actions) ya en la máquina destino:

1. Correr el instalador. El NSIS importa la distro `lics-wsl` desde el
   `.tar` embebido y registra la tarea programada de inicio
   (`register-scheduled-task.ps1`).
2. Abrir el ícono "LICS" del escritorio. Primera vez: pantalla de
   "Iniciando…" mientras arrancan Docker/PostgreSQL/backend/frontend/nginx
   dentro de WSL2; las siguientes veces, si ya estaban corriendo, es casi
   instantáneo.
3. **Crear el primer usuario administrador.** Todavía no está automatizado
   en `provision-golden-image.sh` (ver `docs/windows-desktop-stage-closure.md`,
   §13) — es un paso manual, una sola vez por instalación nueva, en
   PowerShell contra la distro `lics-wsl`:
   ```powershell
   wsl -d lics-wsl -- bash -c "cd /opt/lics/infra/docker && docker compose --env-file .env.prod -f compose.prod.yml run --rm --no-deps backend python src/manage.py createsuperuser"
   ```
   Pide usuario, correo (opcional) y contraseña por teclado.
4. Iniciar sesión en la app con ese usuario.

---

## Problema conocido: caídas intermitentes de conexión (mitigado, no resuelto)

Durante la validación en hardware real, la app perdía la conexión de forma
espontánea navegando entre pantallas ("No fue posible comunicarse con el
sistema local"). Investigado a fondo; esto es lo que se confirmó y lo que
quedó sin confirmar:

**Confirmado por evidencia real** (no por descarte a ciegas):

- `docker.service` (el daemon de Docker, no un contenedor puntual) se
  reinicia solo dentro de la distro `lics-wsl`, en intervalos irregulares.
  Cuando pasa, para todos los contenedores con su señal de parada respectiva.
  `backend`, `frontend` y `postgres` vuelven solos al reiniciar el daemon,
  pero `nginx` no — porque depende de que `backend`/`frontend` ya estén
  resueltos por DNS (`depends_on: condition: service_healthy` en
  `compose.prod.yml`), y esa lógica de orden es de `docker compose`, no del
  daemon crudo. `nginx` se queda caído hasta que alguien lo levante a mano.
- Al menos una vez, no solo `docker.service` sino la VM entera de WSL2 se
  reinició ("uncleanly shutdown" en el journal de systemd).
- `wsl-pro.service` (agente de Ubuntu Pro, viene de fábrica en la imagen de
  Ubuntu, LICS no lo usa) estaba en crash-loop constante por un problema de
  interop con Windows — generaba ruido pero **no era la causa principal**:
  se enmascaró (`provision-golden-image.sh` lo hace por defecto ahora) y el
  problema de fondo siguió pasando igual.

**Descartado con evidencia, no por suposición:**

- Apagado por inactividad de WSL2 (`vmIdleTimeout`) — está correctamente
  configurado en `-1` para el usuario de Windows real que usa la app.
- Docker Desktop instalado en la misma máquina — se desinstaló por completo
  y el problema siguió.
- Suspensión/hibernación de Windows — cero eventos `Kernel-Power` en el
  Visor de Eventos en el momento exacto de una caída.
- Un crash de Hyper-V logueado por Windows — cero eventos también.

**Sin confirmar todavía:** quién o qué reinicia `docker.service` (y, al
menos una vez, la VM completa). No dejó rastro en el Visor de Eventos de
Windows, lo que sugiere algo a nivel de `wsl.exe --shutdown`/`--terminate` o
un problema interno de la VM (se llegó a ver un journal marcado como
`corrupted or uncleanly shutdown`, compatible con corrupción del disco
virtual de la distro tras varios ciclos de apagado forzado durante la propia
sesión de debugging). La distro se reconstruyó desde cero como medida de
precaución; si el síntoma reaparece en una imagen construida limpia, la
corrupción queda descartada también.

**Mitigación instalada (`lics-watchdog.timer`):** corre `start.sh` cada 2
minutos dentro de la distro. Como `start.sh` pasa por `docker compose up`
(que sí respeta `depends_on`), cualquier servicio que haya quedado caído por
un reinicio crudo del daemon se reconcilia solo en menos de 2 minutos, sin
que el usuario tenga que notar nada ni tocar el menú "Reiniciar servicios".
No arregla la causa de fondo — la esconde lo suficiente para que no sea un
problema de uso diario mientras se sigue investigando.

Si esto vuelve a aparecer: `docs/troubleshooting.md` tiene la sección
"Windows: caídas intermitentes de conexión" con los comandos de diagnóstico
ya probados.

---

## Estructura de este directorio

```
.github/workflows/
  build-windows-installer.yml        corre en el runner self-hosted (tu PC Windows)

infra/windows/
  README.md                          este archivo
  wsl/
    build-golden-image.ps1           orquesta la imagen dorada, desde Windows, de punta a punta
    cut-release.ps1                  un solo comando: detecta el release, arma la imagen, dispara Actions
    provision-golden-image.sh        lo invoca build-golden-image.ps1 dentro de la distro
  electron/
    package.json
    main.js                          arranque, ventana normal (no kiosco), menú
    preload.js
    lib/backend.js                   llama wsl.exe hacia los scripts existentes
    renderer/loading.html            pantalla de "Iniciando LICS..."
    build/installer.nsh              hooks NSIS: importa la distro durante la instalación
    resources/windows/
      install-wsl-distro.ps1         corre el instalador durante el setup
      register-scheduled-task.ps1    tarea "iniciar backend al iniciar sesión" (dispara una sola vez por login)
      (lics-wsl-rootfs.tar va acá, generado en el paso de arriba)

infra/systemd/
  lics.service / lics-backup.timer   sin modificar, se instalan tal cual dentro de la distro
  lics-watchdog.service/.timer       nuevo: reconcilia servicios caídos cada 2 min (ver "Problema conocido" arriba)

scripts/
  install-watchdog-timer.sh          instala lics-watchdog.{service,timer}, lo invoca provision-golden-image.sh
```
