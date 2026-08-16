# Cierre de etapa: app de escritorio para Windows

## 1. Propósito

Registra el cierre de la etapa de empaquetado de LICS como aplicación de
escritorio nativa para Windows: instalador `.exe`, imagen dorada de WSL2,
pipeline de release y runner self-hosted de GitHub Actions. Reúne en un solo
lugar todo lo investigado, roto y corregido durante la validación en
hardware real, incluyendo detalle que no vive en ningún otro documento del
repo (la configuración del runner self-hosted no está documentada en ningún
otro lado).

Este documento no reemplaza a `infra/windows/README.md` (referencia de uso
día a día) ni a `docs/troubleshooting.md` (comandos de diagnóstico); es el
registro histórico de cómo se llegó ahí.

## 2. Decisión de arquitectura

Motor: WSL2 + Ubuntu 24.04 con Docker Engine real corriendo adentro — no
Docker Desktop. Los scripts productivos de `scripts/*.sh` e
`infra/systemd/*` se instalan sin ningún cambio dentro de esa distro; la
única capa nueva es Windows: un instalador que prepara WSL2 y una app
Electron que arranca/verifica los servicios y muestra la interfaz web de
LICS en una ventana nativa normal (sin modo kiosco, porque la misma
computadora también se usa para Office).

Cerrar la ventana no apaga los servicios: Docker y PostgreSQL siguen
corriendo dentro de WSL2, igual que cerrar Word no apaga la computadora.
Volver a abrir el ícono reconecta con lo que ya está corriendo o lo arranca
si hacía falta. El respaldo automático (`lics-backup.timer`, con
`Persistent=true`) funciona igual que en Linux aunque la máquina se apague
de noche, porque corre dentro de WSL2 sin modificarse; solo hace falta que
la distro arranque con Windows, de eso se encarga
`register-scheduled-task.ps1`.

`restore.sh`, `rollback.sh` y `update.sh` no se expusieron como botón en la
app a propósito — piden confirmación escrita porque son destructivos, y
automatizarlos les quita el propósito a esa protección. Siguen siendo
procedimientos manuales por WSL, igual que por SSH en Linux.

El detalle completo de esta decisión (con la justificación de cada punto)
está en `infra/windows/README.md`, sección "Decisión de arquitectura".

## 3. Componentes de esta etapa

```
.github/workflows/build-windows-installer.yml    workflow del runner self-hosted

infra/windows/
  README.md                          referencia de uso
  wsl/build-golden-image.ps1         orquesta la imagen dorada desde Windows
  wsl/cut-release.ps1                un comando: detecta release, arma imagen, dispara Actions
  wsl/provision-golden-image.sh      corre dentro de la distro (Docker, la app, systemd)
  electron/                          app Electron (ventana, arranque, instalador NSIS)

infra/systemd/
  lics-watchdog.service/.timer       nuevo en esta etapa: autocuracion cada 2 min

scripts/
  install-watchdog-timer.sh          instala el watchdog, invocado por provision-golden-image.sh
  build-offline-release.sh           ya existía; es el primer comando del flujo de release
```

## 4. Flujo de release: dos máquinas, un comando cada una

Sacar una versión nueva del `.exe` cruza dos computadoras (donde se
compilan las imágenes de la app — un Mac en este caso — y la Windows), sin
puente automático entre ellas todavía. Cada lado es un solo comando.

**En la máquina de build** (requiere Docker con `buildx`; construye
`linux/amd64` aunque el host sea otra arquitectura):

```bash
./scripts/build-offline-release.sh
```

Exige árbol de git limpio (`git status --porcelain` vacío, si no aborta) y
empaqueta solo archivos ya comprometidos a git vía `git archive HEAD`
— archivos sin commitear quedan afuera del release en silencio. Construye y
valida (`docker image inspect --platform`) las 4 imágenes necesarias
(`lics-backend`, `lics-frontend`, `nginx:1.28-alpine`,
`postgres:17-alpine`), genera `manifest.txt`/`SHA256SUMS`/`VERSION`, y
publica en `release/lics-<versión>-linux-amd64/`. Esa carpeta se transfiere
a mano (USB, red) a `C:\lics-dev\` en la Windows.

**En la Windows**, con la carpeta de release ya copiada:

```powershell
cd wsl
.\cut-release.ps1
```

Detecta sola la carpeta de release más nueva bajo `C:\lics-dev\` (por fecha
de modificación, exige que tenga `app\` e `images\`), reconstruye la imagen
dorada invocando `build-golden-image.ps1`, y si hay `gh` (GitHub CLI)
instalado y logueado dispara `gh workflow run build-windows-installer.yml`
y espera (`gh run watch --exit-status`) hasta que el `.exe` esté listo. Sin
`gh`, hace la imagen dorada igual y avisa que falta apretar "Run workflow"
a mano.

Antes de esta etapa, sacar un release eran ~4-5 pasos manuales repartidos en
las dos máquinas; quedó reducido a un comando por máquina.

Este flujo, y el atajo `make release` (agregado al `Makefile`, protegido
para edición remota, así que se agregó a mano) sobre
`build-offline-release.sh`, se decidieron después de que el usuario pidiera
explícitamente optimizar el proceso de sacar un release nuevo.

## 5. Imagen dorada: qué hace `build-golden-image.ps1` + `provision-golden-image.sh`

En orden: habilita WSL2 (reinicia Windows solo si hacía falta activarlo por
primera vez, y se reanuda solo via una entrada `RunOnce`) → descarga e
importa Ubuntu 24.04 con `wsl --import` (nunca `wsl --install`, que puede
abrir un asistente interactivo de creación de usuario) → activa `systemd` y
usuario `root` por defecto dentro de la distro → corre
`provision-golden-image.sh` dentro de esa distro → exporta el `.tar` final a
`C:\lics-build\lics-wsl-rootfs.tar`.

`provision-golden-image.sh`, corriendo como root dentro de la distro
`lics-build`: instala Docker Engine, copia la app desde `$RELEASE_DIR/app/`,
carga las 4 imágenes offline, genera `.env.prod`, corre migraciones
iniciales y `setup_roles`, instala `lics.service`/`lics-backup.timer`/
`lics-watchdog.timer`, enmascara `wsl-pro.service` (ver §7), y valida que
`start.sh`/`healthcheck.sh` no hayan sido modificados.

Lo único que no se puede automatizar por ser un ajuste de firmware —
activar virtualización en BIOS/UEFI— sigue siendo manual, una vez, antes de
correr el script; si no está activa el script para con un mensaje claro en
vez de fallar a medias.

## 6. Bugs reales encontrados y corregidos en esta etapa

Todos aparecieron en la validación contra hardware Windows 11 real (nunca
en el entorno de desarrollo), en el orden en que se fueron encontrando:

- **Falso negativo de virtualización**: `build-golden-image.ps1` leía
  `Win32_Processor.VirtualizationFirmwareEnabled` de WMI y bloqueaba la
  instalación aun con la BIOS/UEFI bien configurada. Pasó de bloqueo a
  advertencia — el chequeo real y definitivo es el intento de arranque de
  WSL2 en sí.
- **Descarga de rootfs corrupta dada por válida**: una descarga
  interrumpida dejaba un archivo que el script aceptaba solo por existir.
  Se agregó validación con `tar -tzf` (la misma herramienta que usa WSL
  internamente) con reintento automático si falla.
- **Error de parseo de PowerShell solo en 5.1 real** ("Falta la cadena en
  el terminador"), nunca reproducible en el entorno de desarrollo: causado
  por caracteres acentuados sin BOM UTF-8, que PowerShell 5.1 decodifica
  mal con la codepage ANSI del sistema. Se reescribió el script sin
  caracteres no-ASCII y se guardó con BOM UTF-8.
- **Falso positivo de Docker Engine instalado**: `install_docker_engine()`
  usaba solo `command -v docker`, que encontraba un stub de Docker Desktop
  si estaba instalado en la Windows, sin que hubiera Docker Engine real
  dentro de la distro. Se agregó exigencia adicional de `dpkg -s
  docker-ce`.
- **Filtración del `PATH` de Windows dentro de WSL2**: se aisló con
  `[interop] appendWindowsPath=false` en `wsl.conf`, para que binarios del
  lado Windows no se colaran dentro de la distro.
- **`wsl-pro.service` en crash-loop constante**: consecuencia directa del
  fix anterior — el agente de Ubuntu Pro (viene de fábrica en la imagen,
  LICS no lo usa) dependía de ese interop roto y reintentaba cada ~2
  segundos (`exec format error` contra `cmd.exe`). Se enmascaró
  (`systemctl mask wsl-pro.service`) de forma permanente dentro de
  `provision-golden-image.sh`. Generaba ruido real en los logs pero
  **no era la causa de fondo** del problema del §7 — se confirmó
  enmascarándolo y viendo que el síntoma principal seguía pasando igual.
- **Workflow con `shell: pwsh`**: el runner self-hosted solo tiene Windows
  PowerShell 5.1 instalado, no PowerShell 7. Cambiado a `shell: powershell`
  en `build-windows-installer.yml`.
- **Checkout aislado del runner sin el `.tar`**: cada corrida del runner
  clona el repo en su propia carpeta de trabajo interna, distinta de
  cualquier clon manual en la máquina; y el `.tar` de la imagen dorada está
  en `.gitignore` a propósito (pesa varios GB, nunca va a git). Se agregó
  un paso al workflow que copia `C:\lics-build\lics-wsl-rootfs.tar` hacia
  adentro del checkout en cada corrida.
- **`electron-builder` fallaba extrayendo `winCodeSign`**: el paquete trae
  un `.dylib` de macOS aunque el build sea solo para Windows, y la
  extracción de ese archivo requiere privilegio de symlink que el runner no
  tenía. `CSC_IDENTITY_AUTO_DISCOVERY: "false"` (probado primero) no lo
  resolvió. Se resolvió activando el Modo de Desarrollador de Windows
  (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock` →
  `AllowDevelopmentWithoutDevLicense = 1`) más un reinicio del servicio del
  runner.

El detalle línea por línea de cada uno de estos fixes está en el historial
de git (commits con prefijo `fix:` alrededor de esta etapa) y en
`CHANGELOG.md`.

## 7. Configuración del runner self-hosted de GitHub Actions

Un runner `windows-latest` de GitHub no sirve para este caso: el instalador
final incluye adentro la imagen completa de WSL2 (Ubuntu + Docker + la app
+ las 4 imágenes cargadas), varios GB, y no hay forma sana de mover eso a
través de la nube de GitHub. Además esos runners no traen WSL2 utilizable
en un job de CI (activar WSL2 pide un reinicio que un job no puede dar).

La solución fue registrar la misma PC Windows donde ya se genera el `.tar`
como runner self-hosted, con label `lics-windows`. Esto no está en ningún
otro documento del repo — es el paso a paso real de cómo quedó configurado:

1. En GitHub: **Settings > Actions > Runners > New self-hosted runner >
   Windows**. Copiar y correr tal cual los comandos que GitHub genera ahí
   (token único por repo, vencen — no reusar comandos viejos). Al
   preguntar por labels adicionales durante `config.cmd`, agregar
   `lics-windows` (coincide con `runs-on: [self-hosted, Windows,
   lics-windows]` en el workflow).
2. Instalar como servicio de Windows en vez de correrlo interactivo, para
   que quede siempre disponible:
   ```powershell
   .\svc.cmd install
   .\svc.cmd start
   ```
3. **Permisos de carpeta**: el servicio del runner corre por defecto como
   `NT AUTHORITY\NETWORK SERVICE`, una cuenta sin acceso a `C:\lics-dev\`
   por default. Síntoma: "Access to the path ... is denied" al intentar
   leer o escribir ahí. Se resolvió dando permiso explícito:
   ```powershell
   icacls "C:\lics-dev" /grant "NT AUTHORITY\NETWORK SERVICE:(OI)(CI)M" /T
   ```
4. **Política de ejecución de PowerShell**: la cuenta de servicio del
   runner tenía la política por defecto, que bloquea scripts con "running
   scripts is disabled on this system". Se resolvió con:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine -Force
   ```
5. **`shell: powershell`, no `pwsh`**, en el workflow — ver §6, este runner
   nunca tuvo PowerShell 7 instalado.
6. **Modo de Desarrollador de Windows** activado (ver §6) para que
   `electron-builder` pueda extraer symlinks de `winCodeSign` durante `npm
   run dist`.

Con el runner corriendo, cada release nuevo se dispara desde la pestaña
**Actions > build-windows-installer > Run workflow** (o automáticamente
vía `cut-release.ps1`, si `gh` está disponible), y el `.exe` se descarga
del artefacto `LICS-Setup` al terminar.

Dos notas operativas:

- Compilar el `.exe` **no reemplaza** correr `build-golden-image.ps1` — ese
  paso sigue siendo manual porque implica un reinicio de Windows que un job
  de Actions no puede sobrevivir.
- Sin certificado de firma de código, Windows muestra SmartScreen
  ("Windows protegió su PC") al instalar el `.exe` — esperado; "Más
  información > Ejecutar de todas formas".

## 8. Instalación y primer uso en una máquina real

1. Correr el `.exe` generado (artefacto `LICS-Setup` de Actions). El
   instalador NSIS importa la distro `lics-wsl` desde el `.tar` embebido y
   registra la tarea programada de inicio (`register-scheduled-task.ps1`).
2. Abrir el ícono "LICS" del escritorio. Primera vez: pantalla de
   "Iniciando…" mientras arrancan Docker/PostgreSQL/backend/frontend/nginx
   dentro de WSL2; siguientes veces, si ya estaban corriendo, es
   prácticamente instantáneo.
3. **Ya no es un paso manual**: `provision-golden-image.sh` crea un usuario
   `admin` con contraseña aleatoria (`openssl rand -base64 24`) al construir
   la imagen dorada, distinta en cada build. Para verla:
   ```powershell
   wsl -d lics-wsl -- sudo cat /opt/lics/ADMIN_CREDENTIALS_INICIALES.txt
   ```
4. Iniciar sesión en la app con ese usuario y **cambiar esa contraseña de
   inmediato** (o crear un usuario administrador propio y desactivar este).
   Todas las instalaciones hechas desde la misma imagen dorada comparten esa
   contraseña hasta que se cambie.

## 9. Problema conocido: caídas intermitentes de conexión

Durante la validación en hardware real, la app perdía la conexión de forma
espontánea navegando entre pantallas ("No fue posible comunicarse con el
sistema local"), llegando incluso a pantallas en blanco si se seguía
navegando.

Investigada en tres rondas, hasta encontrar la causa raíz real y
confirmarla resuelta con uso extendido real. Documentado en detalle, con
los logs exactos, en `infra/windows/README.md`, sección "Problema
conocido". Resumen:

- **Causa raíz confirmada:** WSL2 apagaba la distro `lics-wsl` completa
  (`systemd` entero, no solo Docker — por eso `lics-watchdog.timer` también
  aparecía reiniciado) unos segundos después de terminar de arrancar,
  **cuando no quedaba ningún proceso `wsl.exe` conectado como cliente**.
  `systemd=true` en `wsl.conf` (correctamente configurado) no fue
  suficiente por sí solo en esta versión de WSL2 (2.7.11.0). La única
  tarea programada que arrancaba la distro corría `wsl -d lics-wsl --
  start.sh` y terminaba en cuanto ese script terminaba, sin dejar ningún
  cliente conectado detrás.
- Confirmado con `journalctl` acotado al segundo exacto del apagado, en
  múltiples ocurrencias: `systemd-logind: The system will power off now!`
  seguido de un `poweroff.target` completo, siempre 2 segundos después de
  que systemd terminaba de arrancar — patrón sistemático, no aleatorio.
- Descartado con evidencia real a lo largo de la investigación: WSL
  desactualizado (`wsl --version` ya en la última versión), código de la
  app Electron (`lib/backend.js`/`main.js` revisados completos, sin ningún
  `wsl --terminate`/`--shutdown` ni polling automático), `vmIdleTimeout`
  (gobierna la VM completa, no una distro individual), Docker Desktop
  residual, suspensión/hibernación de Windows, crash de Hyper-V, presión de
  memoria (16GB totales, 6GB libres al momento del corte).
- Causas insuficientes investigadas antes de llegar a la causa raíz real
  (documentadas para no repetir el camino si algo similar reaparece):
  exclusión de Windows Defender faltante sobre `C:\ProgramData\LICS\wsl`
  (se agregó, buena práctica, pero el síntoma siguió pasando igual con la
  exclusión puesta); un desajuste de timeouts entre `wait_for_all_services`
  (hasta 720s en el peor caso, 4 servicios × 180s cada uno) y
  `TimeoutStartSec=300` de `lics.service` (real, pero no era la causa de
  fondo del apagado).
- **Fix aplicado:** `register-scheduled-task.ps1` ahora registra una
  segunda tarea programada, "LICS - Mantener sesion WSL activa", que corre
  `wsl -d lics-wsl -- sleep infinity` de forma indefinida
  (`ExecutionTimeLimit=0`, reinicio automático si el proceso muere).
  Mientras esté viva, WSL2 nunca ve la distro sin clientes.
- **Confirmado resuelto con uso real extendido** tras aplicar el fix — no
  solo mitigado, no solo teoría consistente con evidencia: probado en vivo,
  navegando la app normalmente durante varios minutos, sin caídas.

Comandos de diagnóstico si reaparece: `docs/troubleshooting.md`, sección
"Windows: caídas intermitentes de conexión" — el primer paso ahora es
confirmar que la tarea de mantener sesión sigue activa.

## 10. Fix real y mitigación de red de seguridad

**Fix de la causa raíz — tarea programada de mantener sesión WSL activa:**
`register-scheduled-task.ps1` registra "LICS - Mantener sesion WSL activa",
que corre `wsl -d lics-wsl -- sleep infinity` de forma indefinida
(`ExecutionTimeLimit=0` para que Task Scheduler no la mate a los 3 días,
`RestartCount=999`/`RestartInterval=1min` si el proceso muere igual).
Mientras ese proceso esté vivo, WSL2 nunca ve la distro sin clientes
conectados y no la apaga (§9). Se registra junto con la tarea existente
que arranca `start.sh` al iniciar sesión.

**Mitigación de red de seguridad — `lics-watchdog.timer`:** corre
`start.sh` cada 2 minutos dentro de la distro (`OnBootSec=2min`,
`OnUnitActiveSec=2min`). Como `start.sh` pasa por `docker compose up`, que
sí respeta `depends_on`, cualquier servicio que haya quedado caído por
cualquier otra causa (no solo la de §9) se reconcilia solo, sin que el
usuario tenga que notar nada. Instalado por
`scripts/install-watchdog-timer.sh` (mismo patrón que
`install-backup-timer.sh`), invocado automáticamente por
`provision-golden-image.sh`. Se mantiene aunque la causa raíz de §9 ya esté
resuelta, como capa adicional de resiliencia.

## 10.1 Otros fixes de estabilización

Encontrados y corregidos por revisión de código tras cerrar el problema del
§9-§10, sin requerir hardware Windows para reproducirlos (verificables por
inspección; los dos primeros sí necesitan una imagen dorada nueva para
tomar efecto en una instalación real, el tercero solo necesita un `.exe`
nuevo):

- **`install_application()` no resincronizaba sobre una distro ya
  aprovisionada**: se saltaba por completo la copia de la app si `/opt/lics`
  ya existía (`if [[ -d /opt/lics ]]; then ... return; fi`), así que
  reconstruir la imagen dorada sobre una distro `lics-build` ya aprovisionada
  no recogía una versión nueva de la app — quedaba silenciosamente con la
  versión vieja. Se quitó ese salto: ahora siempre resincroniza con `cp -a
  "${RELEASE_DIR}/app/." /opt/lics/`. Es seguro porque `.env.prod` no forma
  parte del payload del release (se genera aparte) y nunca se sobreescribe.
- **Desajuste de timeouts entre `wait_for_all_services` y
  `TimeoutStartSec`**: cada uno de los 4 servicios (postgres/backend/
  frontend/nginx) recibía el timeout completo por separado en vez de un
  presupuesto compartido, así que el peor caso real era
  `timeout_seconds x 4` (720s con el default de 180s de `start.sh`) —
  supera el `TimeoutStartSec=300` de `lics.service`. Si ese peor caso
  llegara a darse, systemd mata el script a mitad de camino con
  SIGTERM/SIGKILL, sin que el propio script llegue a loguear ningún error
  (un `trap ERR` no captura señales). `wait_for_all_services()` en
  `scripts/lib/common.sh` ahora reparte un presupuesto total entre los 4
  servicios, con margen real contra `TimeoutStartSec`.
- **Creación automática del administrador inicial**: ver §8 y §9 de este
  documento — `create_initial_admin()`, nueva función en
  `provision-golden-image.sh`, reemplaza el paso manual de
  `createsuperuser`.
- **Bug de foco de Electron en Windows** (reportado en uso real, no en la
  validación inicial): tras un rato, los campos de texto dejaban de
  responder a clics aunque la ventana se veía enfocada — hasta cerrar y
  reabrir la app, o abrir "Ver estado". Causa: en Windows, una
  `BrowserWindow` puede recuperar el foco del sistema operativo (tras
  alt-tab, un diálogo nativo, minimizar/restaurar) sin que el `webContents`
  recupere el foco con ella; visualmente se ve enfocada pero los clics no
  llegan a los inputs. Por eso un diálogo nativo "arreglaba" el síntoma sin
  que nadie lo hubiera diseñado así. `main.js` ahora fuerza
  `win.webContents.focus()` cada vez que la ventana gana foco
  (`win.on('focus', ...)`), en vez de depender de que el usuario note el
  síntoma. Este fix vive en `main.js`, no en la imagen dorada: solo
  requiere compilar un `.exe` nuevo, no reconstruir `lics-wsl-rootfs.tar`.

## 11. Pruebas realizadas

Validación en Windows 11 real, 15-16/08/2026:

- imagen dorada construida de punta a punta con `build-golden-image.ps1`
  (0 fallos, 0 advertencias en la corrida final, después de los fixes del
  §6);
- `.exe` compilado por el runner self-hosted vía `build-windows-installer.yml`;
- instalación del `.exe` en la máquina real;
- primera sesión creada (`createsuperuser` manual);
- uso real de la app navegando entre pantallas;
- investigación completa en vivo del problema del §9, hasta causa raíz
  confirmada;
- **uso extendido real tras aplicar el fix de §10, navegando la app
  normalmente durante varios minutos, sin caídas** — confirma la causa
  raíz, no solo mitigación;
- reconstrucción completa desde cero (`lics-wsl` y `lics-build` borrados y
  regenerados) como parte del propio proceso de investigación;
- validación del flujo de release de un comando por máquina
  (`build-offline-release.sh` + `cut-release.ps1`) generando la versión
  `0.3.0-beta`.

## 12. Riesgos y limitaciones actuales

- No hay puente automático de archivos entre la máquina de build y la
  Windows — la transferencia del release es manual.
- `install_docker_engine()` (a diferencia de `install_application()`, ya
  corregido en §10.1) sigue sin manejar reinstalación sobre una distro
  `lics-build` ya aprovisionada; en la práctica importa poco porque la
  versión de Docker Engine no cambia entre releases de la app.
- El ícono de la app (`icon.ico`) sigue siendo un placeholder.
- Sin certificado de firma de código: SmartScreen aparece siempre al
  instalar.
- El administrador inicial (`create_initial_admin()`, §10.1) usa una
  contraseña compartida entre todas las instalaciones hechas desde la misma
  imagen dorada hasta que se cambie manualmente; depende de que quien
  instale la app siga la instrucción de cambiarla de inmediato.

## 13. Decisiones pendientes

- Resolver skip-if-exists en `install_docker_engine()` (menor prioridad,
  ver §12).
- Reemplazar el ícono placeholder por el logo real de LICS.
- Evaluar certificado de firma de código si SmartScreen se vuelve un
  problema para usuarios finales no técnicos.
- Evaluar un puente automático de archivos entre la máquina de build y la
  Windows si el paso manual (USB/red) se vuelve un cuello de botella
  operativo.

## 14. Criterio de cierre de esta etapa

Esta etapa se considera cerrada como versión funcional inicial validada en
hardware real: el instalador se genera de punta a punta, se instala, y la
app funciona para uso real, con la causa raíz de su problema conocido
confirmada y resuelta (§9-§10), y con los gaps de automatización que
requerían intervención manual del usuario (primer administrador,
resincronización de la imagen dorada) cerrados por revisión de código
(§10.1). No es un cierre definitivo — quedan las decisiones pendientes del
§13 (todas de menor prioridad: ícono, certificado de firma, puente de
archivos entre máquinas) antes de considerar esto listo para distribuir a
un usuario final no técnico sin supervisión.

## 15. Estado general

    App de escritorio Windows: validada en hardware real, funcional y estable.
    Runner self-hosted de GitHub Actions: configurado y documentado (este documento, §7).
    Pipeline de release: reducido a un comando por máquina.
    Causa raíz de caídas intermitentes: confirmada y resuelta, validada con uso real extendido.
    Bug de foco de Electron (inputs no clicables tras un rato): corregido, pendiente de validar con un .exe nuevo.
    Primer usuario administrador: automatizado en la imagen dorada, con contraseña aleatoria por build.
    Resincronización de la app en imagen dorada reconstruida: corregida (antes se saltaba si la distro ya existía).
    Pendiente real: ícono placeholder, certificado de firma de código, puente de archivos entre máquinas — todo de menor prioridad, sin bloquear uso en producción.

## Documentación relacionada

- [README principal](../README.md)
- [Índice de documentación](index.md)
- [Despliegue en Windows (app de escritorio)](../infra/windows/README.md)
- [Solución de problemas](troubleshooting.md)
- [Cierre de infraestructura productiva base](infrastructure-stage-closure.md)
- [Cierre de backend base](backend-base-closure.md)
- [Changelog](../CHANGELOG.md)
