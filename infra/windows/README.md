# LICS para Windows — app de escritorio (sin modo kiosco)

Este directorio es nuevo, no existe todavía en el repo. Es la propuesta
completa para que un colaborador instale un `.exe`, le aparezca un ícono de
"LICS" en el escritorio, lo abra como abriría Word o Excel, y quede
funcionando — sin terminal, sin navegador aparte, sin modo kiosco (la misma
computadora también se usa para Office).

**Nada de esto está probado en una Windows real todavía** porque no había una
disponible al momento de escribirlo. Está escrito con el mismo cuidado que el
resto del proyecto (mismos scripts bash sin tocar, mismas validaciones), pero
falta el paso de "correrlo una vez de verdad" antes de que se acerque a
producción. Dejo marcado exactamente qué parte requiere eso.

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

## Cómo se genera la imagen dorada (un solo comando, automático)

`wsl/build-golden-image.ps1` hace todo el proceso de un tirón, sin pedirte
nada a mano, incluyendo reiniciar Windows si hace falta (se reanuda solo al
volver a iniciar sesión, vía una entrada `RunOnce` que él mismo se registra).
No usa `wsl --install` (ese camino puede abrir un asistente interactivo de
"creá tu usuario"); en cambio descarga el rootfs oficial de Ubuntu 24.04
directo de Canonical y lo importa con `wsl --import`, que nunca dispara
ningún asistente porque solo mueve un sistema de archivos.

En una Windows real, una sola vez:

```powershell
powershell -ExecutionPolicy Bypass -File wsl\build-golden-image.ps1 `
    -ReleaseDir "C:\ruta\a\lics-1.0.2-beta-linux-amd64" `
    -OutputPath "C:\lics-build\lics-wsl-rootfs.tar"
```

Adentro hace, en orden: habilita WSL2 (reinicia y se reanuda solo si hacía
falta) → descarga e importa Ubuntu 24.04 sin asistente → activa `systemd` y
usuario `root` por defecto dentro de la distro (reinicia solo la distro, eso
es instantáneo, no es el reinicio de Windows) → corre
`provision-golden-image.sh` (Docker Engine, copia la app, carga imágenes,
`.env.prod`, migraciones, instala `lics.service`/`lics-backup.timer` **sin
tocarlos**, valida `start.sh`/`healthcheck.sh` tal cual están) → exporta el
`.tar` final.

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

## Estructura de este directorio

```
.github/workflows/
  build-windows-installer.yml        corre en el runner self-hosted (tu PC Windows)

infra/windows/
  README.md                          este archivo
  wsl/
    build-golden-image.ps1           orquesta todo, desde Windows, de punta a punta
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
      register-scheduled-task.ps1    tarea "iniciar backend al iniciar sesión"
      (lics-wsl-rootfs.tar va acá, generado en el paso 5 de arriba)
```
