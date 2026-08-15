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
3. **Crear el primer usuario administrador** — todavía no está
   automatizado (ver §11), es un paso manual una sola vez:
   ```powershell
   wsl -d lics-wsl -- bash -c "cd /opt/lics/infra/docker && docker compose --env-file .env.prod -f compose.prod.yml run --rm --no-deps backend python src/manage.py createsuperuser"
   ```
4. Iniciar sesión en la app con ese usuario.

## 9. Problema conocido: caídas intermitentes de conexión

Durante la validación en hardware real, la app perdía la conexión de forma
espontánea navegando entre pantallas ("No fue posible comunicarse con el
sistema local"), llegando incluso a pantallas en blanco si se seguía
navegando.

Investigada en dos rondas. La primera (evidencia indirecta, journal general)
no encontró causa raíz confirmada. La segunda, con `journalctl` acotado a
las unidades exactas y a la ventana de tiempo exacta del corte, sí encontró
una causa concreta y consistente con toda la evidencia. Documentado en
detalle, con el log exacto, en `infra/windows/README.md`, sección "Problema
conocido". Resumen:

- **No es `docker.service` reiniciándose solo.** Es la distro `lics-wsl`
  completa arrancando (`systemd` completo, no solo Docker — por eso
  `lics-watchdog.timer` también aparecía reiniciado) y, entre 2 y 15
  segundos después de terminar de arrancar, recibiendo una orden de apagado
  limpia (`systemd-logind: The system will power off now!`,
  `poweroff.target` completo).
- El propio journal de WSL dejó la pista: `WaitForBootProcess:3488: /sbin/init
  failed to start within 10000ms` — el arranque de `systemd` tardó 22.8
  segundos, más que el timeout interno de WSL2 (10 segundos) para considerar
  que la distro arrancó.
- Descartado con evidencia real en esta segunda ronda: WSL desactualizado
  (`wsl --version` ya en la última versión) y código de la app Electron
  (`lib/backend.js`/`main.js` revisados completos: no hay ningún `wsl
  --terminate`/`--shutdown` ni polling automático).
- Causa más probable encontrada: el directorio de la distro
  (`C:\ProgramData\LICS\wsl`, con el `.vhdx` adentro) no tenía ninguna
  exclusión configurada en Windows Defender (`Get-MpPreference
  -ExclusionPath` vacío) — el escenario típico donde el antivirus escaneando
  el disco en tiempo real frena el I/O lo suficiente como para disparar el
  timeout de 10 segundos de WSL2.
- Descartado con evidencia real en la primera ronda (sigue siendo válido):
  `vmIdleTimeout`, Docker Desktop residual, suspensión/hibernación de
  Windows, crash de Hyper-V.
- Mitigado en dos capas: exclusión de Windows Defender (aplicada a mano y
  automatizada en `install-wsl-distro.ps1`/`build-golden-image.ps1` desde
  esta versión) y `lics-watchdog.timer` (§10) como red de seguridad.
- **Todavía no confirmado al 100%** con uso extendido real después de la
  exclusión — es la explicación más consistente con la evidencia, no una
  certeza absoluta.

Comandos de diagnóstico si reaparece: `docs/troubleshooting.md`, sección
"Windows: caídas intermitentes de conexión" — incluye cómo confirmar si es
el mismo patrón (arranque + apagado a los pocos segundos) u otra causa
nueva.

## 10. Mitigación: `lics-watchdog.timer`

Nuevo en esta etapa. Corre `start.sh` cada 2 minutos dentro de la distro
(`OnBootSec=2min`, `OnUnitActiveSec=2min`). Como `start.sh` pasa por
`docker compose up`, que sí respeta `depends_on`, cualquier servicio que
haya quedado caído por un reinicio crudo del daemon se reconcilia solo, sin
que el usuario tenga que notar nada. Instalado por
`scripts/install-watchdog-timer.sh` (mismo patrón que
`install-backup-timer.sh`), invocado automáticamente por
`provision-golden-image.sh`.

No arregla la causa de fondo — la esconde lo suficiente para que no sea un
problema de uso diario mientras se sigue investigando.

## 11. Pruebas realizadas

Validación en Windows 11 real, 15/08/2026:

- imagen dorada construida de punta a punta con `build-golden-image.ps1`
  (0 fallos, 0 advertencias en la corrida final, después de los fixes del
  §6);
- `.exe` compilado por el runner self-hosted vía `build-windows-installer.yml`;
- instalación del `.exe` en la máquina real;
- primera sesión creada (`createsuperuser` manual);
- uso real de la app navegando entre pantallas;
- reproducción y diagnóstico en vivo del problema del §9;
- reconstrucción completa desde cero (`lics-wsl` y `lics-build` borrados y
  regenerados) como parte del propio proceso de investigación;
- validación del flujo de release de un comando por máquina
  (`build-offline-release.sh` + `cut-release.ps1`) generando la versión
  `0.3.0-beta`.

## 12. Riesgos y limitaciones actuales

- La causa más probable de las caídas intermitentes (exclusión de Windows
  Defender faltante) no está confirmada al 100% con uso extendido real
  todavía; `lics-watchdog.timer` sigue como red de seguridad de todas
  formas.
- No hay puente automático de archivos entre la máquina de build y la
  Windows — la transferencia del release es manual.
- `provision-golden-image.sh` no automatiza `createsuperuser`.
- `install_application()`/`install_docker_engine()` no manejan
  reinstalación sobre una distro `lics-build` ya aprovisionada.
- El ícono de la app (`icon.ico`) sigue siendo un placeholder.
- Sin certificado de firma de código: SmartScreen aparece siempre al
  instalar.

## 13. Decisiones pendientes

- Automatizar `createsuperuser` (o un flujo equivalente de primer usuario)
  dentro de `provision-golden-image.sh`.
- Resolver skip-if-exists en `install_application()`/`install_docker_engine()`.
- Confirmar con uso extendido real que la exclusión de Windows Defender
  (§9) elimina las caídas intermitentes de forma definitiva.
- Reemplazar el ícono placeholder por el logo real de LICS.
- Evaluar certificado de firma de código si SmartScreen se vuelve un
  problema para usuarios finales no técnicos.

## 14. Criterio de cierre de esta etapa

Esta etapa se considera cerrada como versión funcional inicial validada en
hardware real: el instalador se genera de punta a punta, se instala, y la
app funciona para uso real, con un problema conocido mitigado (no
resuelto) y documentado. No es un cierre definitivo — quedan las
decisiones pendientes del §13 antes de considerar esto listo para
distribuir a un usuario final no técnico sin supervisión.

## 15. Estado general

    App de escritorio Windows: validada en hardware real, funcional con mitigación activa.
    Runner self-hosted de GitHub Actions: configurado y documentado (este documento, §7).
    Pipeline de release: reducido a un comando por máquina.
    Causa raíz de caídas intermitentes: sin confirmar, mitigada.
    Primer usuario administrador: manual, sin automatizar.

## Documentación relacionada

- [README principal](../README.md)
- [Índice de documentación](index.md)
- [Despliegue en Windows (app de escritorio)](../infra/windows/README.md)
- [Solución de problemas](troubleshooting.md)
- [Cierre de infraestructura productiva base](infrastructure-stage-closure.md)
- [Cierre de backend base](backend-base-closure.md)
- [Changelog](../CHANGELOG.md)
