# Lista de preparación para producción — Windows (app de escritorio)

## Por qué existe este documento

`docs/production-readiness-checklist.md` y `docs/deployment.md` describen
un plan de despliegue anterior: Ubuntu Desktop/Linux Mint con Chromium en
modo kiosco. Ese plan quedó reemplazado por la app de escritorio nativa
para Windows (WSL2 + Docker Engine + Electron), documentada en
`infra/windows/README.md` y `docs/windows-desktop-stage-closure.md`. Los
requisitos de esos documentos viejos (SSH con llaves, firewall, autologin
gráfico, modo kiosco) **no aplican** al objetivo real actual — quedaron
ahí como registro histórico, marcados como tal, no como checklist vigente.

Este documento es el checklist vigente: qué tiene que cumplirse antes de
tratar una instalación de LICS en Windows como la instalación de
producción real, con datos reales del negocio.

## Máquina de pruebas vs. máquina de producción

Una máquina donde se estuvo iterando activamente (probando fixes,
reinstalando el `.exe` varias veces, reconstruyendo la imagen dorada) es
útil para validar que los mecanismos funcionan, pero **no es, por sí
sola, una instalación de producción** — acumula estado de pruebas
(releases de prueba en `C:\lics-dev\`, posibles reinicios manuales,
datos de prueba en la base). Antes de operar con datos reales del
negocio en una máquina:

- [ ] Es una instalación dedicada — no la misma máquina donde se estuvo
      debuggeando activamente, o si lo es, se limpiaron los datos de
      prueba y se confirmó el estado real de la base de datos.
- [ ] La versión del `.exe` instalado es una que ya se validó en la
      máquina de pruebas (ver más abajo), no un build recién salido de
      una sesión de debugging.

## Hardware y software previo

- [ ] Virtualización activa en BIOS/UEFI, confirmada (no solo el chequeo
      automático de `build-golden-image.ps1`, que puede dar falso
      negativo — ver `infra/windows/README.md`).
- [ ] Windows 10/11 con soporte WSL2.
- [ ] Espacio en disco suficiente: la imagen dorada, las 4 imágenes
      Docker, y espacio para backups y futuras actualizaciones
      (`/opt/lics-updates/` dentro de la distro, ver
      `docs/troubleshooting.md`).
- [ ] Sin Docker Desktop instalado (o desinstalado si estaba — puede
      inyectar un `docker` que no es Docker Engine real).
- [ ] Windows Defender: la exclusión sobre la carpeta de la distro se
      agrega sola durante la instalación; confirmar que quedó (`Get-MpPreference
      | Select-Object -ExpandProperty ExclusionPath`).

## Instalación

- [ ] `.exe` generado desde una versión de `VERSION` con significado
      real (no una versión de prueba tipo `0.4.0-beta` usada solo para
      validar mecanismos), a menos que esa sea deliberadamente la
      primera versión de producción.
- [ ] El instalador terminó sin errores: WSL2 habilitado, distro
      `lics-wsl` importada, tareas programadas registradas.
- [ ] Primer login con el administrador generado automáticamente
      (`wsl -d lics-wsl -- sudo cat /opt/lics/ADMIN_CREDENTIALS_INICIALES.txt`).
- [ ] Contraseña de ese administrador cambiada de inmediato (o
      reemplazado por un usuario administrador propio, con este
      desactivado).

## Validación mínima antes de confiar datos reales del negocio

Estos son los puntos que, a la fecha de este documento, todavía no
tienen validación de uso real extendido — no alcanza con que el código
se vea correcto:

- [ ] **Uso real extendido (varios días, sin tocar nada) sin caídas de
      conexión.** Confirma que las tareas programadas con ventana
      realmente oculta (`register-scheduled-task.ps1`) aguantan sin que
      nadie las mate por accidente — ver `infra/windows/README.md`,
      sección "Problema conocido", la ronda de endurecimiento del
      16/08/2026.
- [ ] **"Actualizar aplicación (Django/Next)" probado exitosamente al
      menos una vez**, idealmente en una máquina de pruebas antes que en
      la de producción, con un release real (no solo revisión de
      código).
- [ ] Backup automático (`lics-backup.timer`) confirmado corriendo:
      `wsl -d lics-wsl -- systemctl status lics-backup.timer --no-pager`.
- [ ] Al menos un backup real verificado con
      `scripts/verify-backup.sh`.
- [ ] Watchdog (`lics-watchdog.timer`) confirmado activo:
      `wsl -d lics-wsl -- systemctl status lics-watchdog.timer --no-pager`.
- [ ] Si la instalación de producción se hizo con reimportación fresca
      de la distro (no "encima" de una instalación previa): confirmar
      que `create_initial_admin()` efectivamente creó el administrador
      (no solo que el build terminó sin errores).

## Seguridad

- [ ] Contraseña de administrador inicial cambiada (no queda la
      generada automáticamente en uso).
- [ ] `.env.prod` con permisos 600 (se genera así automáticamente;
      confirmar que no se tocó a mano con permisos más abiertos).
- [ ] SmartScreen: sin certificado de firma de código todavía, así que
      aparece siempre al instalar. Quien instale debe saber que es
      esperado ("Más información > Ejecutar de todas formas") — no un
      indicio de instalador corrupto.

## Pendiente conocido, no bloqueante para producción

Estos ítems están documentados como pendientes en `CHANGELOG.md` y
`docs/windows-desktop-stage-closure.md`, pero no impiden operar con datos
reales — son mejoras de conveniencia o de imagen, no de integridad de
datos:

- Ícono de la app (`icon.ico`) placeholder, no el logo real de LICS.
- Certificado de firma de código (evitaría el aviso de SmartScreen).
- Copia externa de respaldos a USB o disco externo (los backups locales
  automáticos ya funcionan; la copia externa es una capa adicional).
- Puente automático de archivos entre la máquina de build y la Windows
  (la transferencia del release sigue siendo manual, USB o red).
- `install_docker_engine()` sin resincronización si Docker Engine ya
  está instalado (no suele importar: la versión de Docker Engine no
  cambia entre releases de la app).

## Criterio de liberación para esta plataforma

Una instalación en Windows puede considerarse lista para producción
únicamente cuando:

- pasó por la lista de "Hardware y software previo" completa;
- la instalación terminó sin errores y el administrador inicial quedó
  funcional, con la contraseña ya cambiada;
- tuvo uso real extendido (días, no minutos) sin que la conexión se
  cayera;
- el backup automático está corriendo y al menos un backup fue
  verificado;
- "Actualizar aplicación" fue probado con éxito al menos una vez, en
  esta máquina o en una de pruebas equivalente;
- quien opera la máquina sabe leer `docs/troubleshooting.md` y
  `infra/windows/README.md` para los problemas conocidos y su
  diagnóstico.

## Documentación relacionada

- [Despliegue en Windows (app de escritorio)](../infra/windows/README.md)
- [Cierre de etapa: app de escritorio para Windows](windows-desktop-stage-closure.md)
- [Solución de problemas](troubleshooting.md)
- [Changelog](../CHANGELOG.md)
- [Lista de preparación para producción (histórica, plan Linux/kiosco superado)](production-readiness-checklist.md)
- [Despliegue (histórico, plan Linux/kiosco superado)](deployment.md)
