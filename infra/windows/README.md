# LICS para Windows — app de escritorio (sin modo kiosco)

Es la propuesta para que un colaborador instale un `.exe`, le aparezca un
ícono de "LICS" en el escritorio, lo abra como abriría Word o Excel, y quede
funcionando — sin terminal, sin navegador aparte, sin modo kiosco (la misma
computadora también se usa para Office).

**Validado en una Windows 11 real el 15-16/08/2026**: imagen dorada
construida, instalador `.exe` compilado por el runner self-hosted,
instalado, primera sesión creada, uso real de la app. En esa validación
aparecieron (y se arreglaron) varios bugs reales de
`build-golden-image.ps1`, `provision-golden-image.sh` y el workflow de
Actions — están todos descritos en `CHANGELOG.md`. También apareció un bug
de conexión intermitente que llevó una investigación larga hasta encontrar
la causa raíz real y confirmarla resuelta con uso extendido — ver
**"Problema conocido: caídas intermitentes de conexión"** más abajo. También
se corrigió un bug de foco de Electron (cuadros de texto que dejaban de
responder tras un rato) y se automatizó la creación del administrador
inicial — ver las secciones correspondientes más abajo y `CHANGELOG.md`.

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
   `.tar` embebido y registra las tareas programadas de inicio
   (`register-scheduled-task.ps1`: arranque de servicios y mantener sesión
   WSL activa).
2. Abrir el ícono "LICS" del escritorio. Primera vez: pantalla de
   "Iniciando…" mientras arrancan Docker/PostgreSQL/backend/frontend/nginx
   dentro de WSL2; las siguientes veces, si ya estaban corriendo, es casi
   instantáneo.
3. **Iniciar sesión con el administrador inicial.** Ya no es un paso
   manual: `provision-golden-image.sh` crea un usuario `admin` con
   contraseña aleatoria al construir la imagen dorada (distinta en cada
   build). Para verla:
   ```powershell
   wsl -d lics-wsl -- sudo cat /opt/lics/ADMIN_CREDENTIALS_INICIALES.txt
   ```
4. **Cambiar esa contraseña de inmediato** desde dentro de la app (o crear
   un usuario administrador propio y desactivar este). Todas las
   instalaciones hechas desde la misma imagen dorada comparten esa
   contraseña hasta que se cambie.

---

## Actualizar la aplicación (Django/Next) en una instalación existente

Importante, porque no es obvio: **volver a correr el `.exe` en una máquina
que ya tiene LICS instalado no actualiza el backend ni el frontend.**
`install-wsl-distro.ps1` se salta a propósito la reimportación del `.tar`
si la distro `lics-wsl` ya existe (para no perder la base de datos ni los
respaldos), así que la imagen dorada nueva nunca llega a una instalación
existente por esa vía — solo sirve para instalaciones limpias en máquinas
nuevas. Reinstalar el `.exe` sobre una instalación existente solo actualiza
los archivos del lado Windows (la app Electron: `main.js`, el menú, fixes
como el de foco), nunca lo que corre dentro de WSL2.

Para actualizar Django/Next en una instalación existente, sin perder datos,
usar el menú **LICS > Actualizar aplicación (Django/Next)…**. Requisitos y
comportamiento:

1. Generar un release offline nuevo en el Mac (`./scripts/build-offline-release.sh`,
   igual que para una imagen dorada) y copiar la carpeta resultante
   (`lics-<versión>-linux-amd64/`, con `app\` e `images\` adentro) a
   `C:\lics-dev\` en esta Windows — el mismo lugar que ya se usa para
   `cut-release.ps1`. Si hay varias carpetas ahí, se usa la más nueva por
   fecha de modificación.
2. Abrir el menú **LICS > Actualizar aplicación (Django/Next)…**. Aparece
   una confirmación explícita antes de tocar nada (no es automático ni se
   dispara solo).
3. Al confirmar, corre `infra/windows/electron/resources/windows/update-application.sh`
   dentro de la distro `lics-wsl` ya viva, que a su vez invoca el
   actualizador oficial (`scripts/update.sh`, ya existía, nunca se expuso
   antes desde Windows): verifica checksums del paquete, exige que la
   instalación actual esté saludable, hace un **respaldo obligatorio**
   antes de tocar nada, detiene los servicios, carga las 4 imágenes
   Docker nuevas, reemplaza `/opt/lics` (conservando `.env.prod` y el
   historial de respaldos), corre migraciones y `setup_roles`, vuelve a
   levantar todo y termina con un healthcheck final. Puede tardar varios
   minutos.
4. Se conserva una copia completa de la instalación anterior en
   `/opt/lics.previous.<timestamp>` dentro de la distro. **No hay rollback
   automático** — si algo falla a mitad de camino, hay que revisar a mano
   (ver `docs/troubleshooting.md`, sección "Windows: 'Actualizar
   aplicación' falla").

Este mecanismo vive en el código de Electron (`lib/backend.js`,
`update-application.sh`), no en la imagen dorada — por eso sí puede llegar
a una instalación existente sin reimportar nada: corre dentro de la distro
que ya está viva, usando `wsl.exe` igual que el resto de los botones del
menú (backup, reiniciar, ver estado). Solo hace falta un `.exe` nuevo para
que el menú tenga esta opción, no una imagen dorada nueva.

`restore.sh` y `rollback.sh` siguen sin exponerse en la app a propósito —
son procedimientos de recuperación distintos a una actualización normal, y
siguen siendo manuales por WSL con confirmación escrita.

---

## Problema conocido: caídas intermitentes de conexión (causa raíz confirmada y resuelta)

Durante la validación en hardware real, la app perdía la conexión de forma
espontánea navegando entre pantallas ("No fue posible comunicarse con el
sistema local"). Investigación larga, en tres rondas — las primeras dos
llegaron a causas parciales/insuficientes, la tercera encontró la causa
raíz real y se confirmó resuelta con uso extendido real.

**Causa raíz confirmada:** WSL2 apagaba la distro `lics-wsl` completa
(`systemd`, Docker, todo — no solo un contenedor) unos segundos después de
terminar de arrancar, **cuando no quedaba ningún proceso `wsl.exe`
conectado como cliente**. `systemd=true` en `wsl.conf` (correctamente
configurado) en teoría debería bastar para que la distro siga corriendo en
segundo plano sin clientes, pero en la práctica, en esta versión de WSL2,
no fue suficiente. Se confirmó con `journalctl` acotado al segundo exacto
del apagado: `systemd-logind: The system will power off now!` seguido de
un `poweroff.target` completo, siempre 2 segundos después de que systemd
terminaba de arrancar — un patrón sistemático, no aleatorio. La única tarea
programada que arrancaba la distro (`register-scheduled-task.ps1`) corría
`wsl -d lics-wsl -- start.sh` y **terminaba en cuanto `start.sh`
terminaba**, sin dejar ningún cliente conectado detrás.

**Fix aplicado:** `register-scheduled-task.ps1` ahora registra una segunda
tarea programada, "LICS - Mantener sesion WSL activa", que corre `wsl -d
lics-wsl -- sleep infinity` de forma indefinida (con
`ExecutionTimeLimit=0` para que Task Scheduler no la mate a los 3 días, y
reinicio automático si el proceso muere igual). Mientras ese proceso esté
vivo, WSL2 nunca ve la distro sin clientes y no la apaga. Confirmado con
uso real extendido: sin caídas.

**Ronda extra de endurecimiento (16/08/2026): el fix de arriba podía
morir si el usuario cerraba la ventana equivocada.** Reapareció el mismo
síntoma después de varios días funcionando bien; el usuario recordó haber
cerrado "unas terminales abiertas" antes de que pasara. Diagnóstico:
`Get-ScheduledTaskInfo` de la tarea "Mantener sesion WSL activa" mostraba
`LastTaskResult = 3221225786` (`0xC000013A`, `STATUS_CONTROL_C_EXIT` — el
código que deja Windows cuando se cierra la consola de un proceso que no
maneja esa señal) y `Get-Process wsl` no encontraba nada corriendo.

La causa: `-Hidden` en `New-ScheduledTaskSettingsSet` **no oculta la
ventana del proceso lanzado** — solo oculta la tarea de la lista del
Programador de Tareas (confirmado contra la documentación oficial de
Microsoft, `ITaskSettings::put_Hidden`). La tarea corre en la sesión
interactiva del usuario (necesario para funcionar con cualquier usuario
que inicie sesión, sin guardar contraseña), así que `wsl.exe -d lics-wsl
-- sleep infinity` sí abría una ventana de consola real — indistinguible a
simple vista de cualquier otra terminal abierta. Cerrarla por error mataba
el proceso exactamente como cerrar cualquier `cmd`/`powershell` a mano.

**Fix real:** la acción de ambas tareas ahora es `powershell.exe
-WindowStyle Hidden` envolviendo un `Start-Process ... -WindowStyle
Hidden` hacia `wsl.exe`. Con `-WindowStyle Hidden` en los dos niveles, el
proceso final no tiene ninguna ventana que mostrar: no aparece en la barra
de tareas, no hay nada a lo que hacer Alt-Tab, y sobre todo no hay nada
que el usuario pueda cerrar sin querer. La tarea de mantener sesión además
gana un bucle propio de reintento (en vez de depender solo del
`RestartCount` de Task Scheduler) para relanzar `wsl.exe` en segundos si
muere por cualquier otra razón. Ver
`infra/windows/electron/resources/windows/register-scheduled-task.ps1`
para el detalle completo, incluida la explicación de por qué la versión
anterior parecía correcta pero no lo era.

**Importante:** este fix vive en `register-scheduled-task.ps1`, que corre
durante la instalación del `.exe` (`install-wsl-distro.ps1` lo invoca
siempre, en cada instalación, incluso sobre una distro que ya existe — a
diferencia de la reimportación del `.tar`, que sí se salta). Un `.exe`
nuevo lo aplica solo con reinstalar, sin reconstruir la imagen dorada. En
una instalación existente que todavía no recibió este fix, la mitigación
inmediata mientras tanto es relanzar la tarea a mano:

```powershell
Start-ScheduledTask -TaskName 'LICS - Mantener sesion WSL activa'
```

**No probado con uso real extendido todavía** (a diferencia del fix
original de más arriba, que sí lo tiene) — es la corrección más reciente,
validada por revisión de código y contra la documentación oficial de
Microsoft, pendiente de confirmar con tiempo real corriendo sin que nadie
la mate por accidente.

**Causas insuficientes investigadas antes de llegar a esta** (documentadas
para no repetir el camino si algo similar reaparece):

- Exclusión de Windows Defender sobre `C:\ProgramData\LICS\wsl` — se
  encontró que faltaba (`Get-MpPreference -ExclusionPath` vacío) y se
  agregó (a mano y automatizada en `install-wsl-distro.ps1`/
  `build-golden-image.ps1`), pero el síntoma siguió pasando igual con la
  exclusión puesta. Buena práctica de todas formas (evita que el
  antivirus escanee el `.vhdx` en cada I/O), se mantiene, pero no era la
  causa.
- `docker.service` reiniciándose "solo" — resultó ser un síntoma, no la
  causa: cuando la distro entera se apaga, `docker.service` se ve
  reiniciado junto con todo lo demás.

**Confirmado con evidencia, no por suposición, a lo largo de toda la
investigación:** cuando la distro se reinicia, `backend`, `frontend` y
`postgres` vuelven solos, pero `nginx` no — porque depende de que
`backend`/`frontend` ya estén resueltos por DNS (`depends_on: condition:
service_healthy` en `compose.prod.yml`), y esa lógica de orden es de
`docker compose`, no del daemon crudo. `wsl-pro.service` (agente de Ubuntu
Pro, viene de fábrica, LICS no lo usa) estaba en crash-loop por un problema
de interop no relacionado — generaba ruido pero no era la causa; se
enmascaró de todas formas.

**Descartado con evidencia a lo largo de la investigación:** apagado por
inactividad de WSL2 (`vmIdleTimeout=-1`, correcto — esto gobierna la VM
completa, no explica el apagado de una distro individual), Docker Desktop
instalado (desinstalado por completo, el problema siguió), suspensión/
hibernación de Windows (cero eventos `Kernel-Power`), crash de Hyper-V
(cero eventos), WSL desactualizado, código de la app Electron (revisado
`lib/backend.js`/`main.js` completos, sin ningún `wsl --terminate`/
`--shutdown` ni polling automático), presión de memoria (16GB totales, 6GB
libres en el momento del corte, sin ajustes de `memory=` en `.wslconfig`).

**Mitigación de red de seguridad, se mantiene igual (`lics-watchdog.timer`):**
corre `start.sh` cada 2 minutos dentro de la distro. Como `start.sh` pasa
por `docker compose up` (que sí respeta `depends_on`), cualquier servicio
que haya quedado caído por cualquier otra causa se reconcilia solo en
menos de 2 minutos.

Si esto vuelve a aparecer: `docs/troubleshooting.md` tiene la sección
"Windows: caídas intermitentes de conexión" con los comandos de diagnóstico
ya probados, incluyendo cómo leer el journal para confirmar si es este mismo
patrón (arranque + apagado a los pocos segundos) u otro nuevo.

---

## Problema conocido: cuadros de texto dejan de responder tras un rato (mitigado, no resuelto — bug upstream de Electron)

Reportado en uso real: tras un rato usando la app, los cuadros de texto
dejaban de aceptar clics aunque la ventana se veía normal y enfocada.
Cerrar y volver a abrir la app lo arreglaba, y también abrir el menú
"LICS > Ver estado" (cualquier diálogo nativo).

**Causa:** bug conocido de Electron en Windows — la ventana (`BrowserWindow`)
puede recuperar el foco del sistema operativo (tras alt-tab, un diálogo
nativo, minimizar/restaurar) sin que el contenido web (`webContents`)
recupere el foco con ella. Visualmente se ve enfocada, pero los clics no le
llegan a los inputs hasta que algo fuerza el refoco del `webContents` —
por eso un diálogo nativo lo "arreglaba" sin que nadie lo hubiera diseñado
así.

**Primer fix aplicado** (`infra/windows/electron/main.js`): se forzaba
`win.webContents.focus()` cada vez que la ventana ganaba foco
(`win.on('focus', ...)`). Este fix se había declarado corregido, pero el
síntoma **reapareció** en uso real: el desenfoque puede ocurrir sin que la
ventana pase por un ciclo real de blur/focus a nivel de sistema operativo
(por ejemplo, tras ciertos reflows internos de Chromium), así que un
handler que solo escucha el evento `'focus'` no cubre todos los casos.

**Investigación confirmó que es un bug real de Electron/Chromium en
Windows, no algo que se pueda resolver por completo desde el código de la
app**: `electron/electron#20464` ("BrowserWindow.isFocused() can return
true when it's not (Windows only)") describe exactamente este síntoma y
fue cerrado por los mantenedores de Electron como "not planned" — lo
reconocen como real pero no lo van a arreglar upstream.
`electron/electron#19977` documenta el mismo workaround que ya se había
observado acá de forma empírica: cambiar el foco a otra ventana y volver
"arregla" el síntoma temporalmente.

**Segunda capa de mitigación aplicada** (`infra/windows/electron/main.js`):
además del handler de `'focus'`, ahora hay un chequeo periódico (cada 1.5s)
que revisa si la ventana está enfocada a nivel de sistema operativo pero el
`webContents` no, y en ese caso fuerza el refoco. La condición exige
`win.isFocused()` primero, para no robarle nunca el foco a otra aplicación
(Word, Excel) cuando LICS está en segundo plano — importante porque esta
app no corre en modo kiosco.

**Honestidad sobre el estado real:** esto es una mitigación adicional
contra un bug confirmado como no resuelto por el propio equipo de
Electron, no una garantía de que el síntoma no vuelva a aparecer nunca.
Si vuelve a pasar después de esta segunda capa, no es un indicio de que
el código esté mal escrito — es el límite real de lo que se puede hacer
desde una app Electron contra este bug específico de Windows. Este fix
vive en el código de Electron, no en la imagen dorada de WSL2: para
llegar a una instalación existente hace falta un `.exe` nuevo (compilado
por el runner self-hosted), no reconstruir la imagen dorada.

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
      register-scheduled-task.ps1    tareas "iniciar backend" + "mantener sesión WSL activa"
      update-application.sh          corre "LICS > Actualizar aplicación" (ver sección de arriba)
      (lics-wsl-rootfs.tar va acá, generado en el paso de arriba)

infra/systemd/
  lics.service / lics-backup.timer   sin modificar, se instalan tal cual dentro de la distro
  lics-watchdog.service/.timer       nuevo: reconcilia servicios caídos cada 2 min (ver "Problema conocido" arriba)

scripts/
  install-watchdog-timer.sh          instala lics-watchdog.{service,timer}, lo invoca provision-golden-image.sh
  update.sh                          actualizador oficial (checksums, respaldo, migraciones); ahora también
                                      invocado desde Windows por update-application.sh, ver arriba
```
