# Solución de problemas

Este documento resume las verificaciones y acciones recomendadas para diagnosticar problemas tanto en el entorno de desarrollo como en una instalación de producción.

---

# Desarrollo

## Verificar estado de los servicios

```bash
make ps
```

## Ver logs

```bash
make logs
```

## Validar la configuración de Docker Compose

```bash
docker compose -f infra/docker/compose.yml config
```

## Verificar el endpoint de salud

```bash
curl http://localhost/api/health/
```

## Verificar la configuración de Django

```bash
make check
```

## Reiniciar el entorno

```bash
make restart
```

---

# Producción

Todos los comandos siguientes asumen una instalación en:

```text
/opt/lics
```

## Ver estado general

```bash
sudo /opt/lics/scripts/status.sh
```

## Ejecutar comprobación completa

```bash
sudo /opt/lics/scripts/healthcheck.sh
```

## Iniciar el sistema

```bash
sudo /opt/lics/scripts/start.sh
```

## Detener el sistema

```bash
sudo /opt/lics/scripts/stop.sh
```

## Reiniciar el sistema

```bash
sudo /opt/lics/scripts/restart.sh
```

## Consultar logs de los contenedores

```bash
cd /opt/lics

sudo docker compose \
  --env-file infra/docker/.env.prod \
  -f infra/docker/compose.prod.yml \
  logs --tail=100
```

---

# PostgreSQL no está saludable

Consultar el estado del sistema:

```bash
sudo /opt/lics/scripts/status.sh
```

Consultar los logs de PostgreSQL:

```bash
cd /opt/lics

sudo docker compose \
  --env-file infra/docker/.env.prod \
  -f infra/docker/compose.prod.yml \
  logs postgres
```

No elimine volúmenes ni bases de datos como intento de solución sin disponer de un respaldo válido.

---

# Backend no responde

```bash
cd /opt/lics

sudo docker compose \
  --env-file infra/docker/.env.prod \
  -f infra/docker/compose.prod.yml \
  logs backend
```

---

# Frontend no responde

```bash
cd /opt/lics

sudo docker compose \
  --env-file infra/docker/.env.prod \
  -f infra/docker/compose.prod.yml \
  logs frontend
```

---

# Nginx no responde

```bash
cd /opt/lics

sudo docker compose \
  --env-file infra/docker/.env.prod \
  -f infra/docker/compose.prod.yml \
  logs nginx
```

---

# Verificar un respaldo

```bash
sudo /opt/lics/scripts/verify-backup.sh /ruta/al/respaldo
```

---

# Restaurar un respaldo

```bash
sudo /opt/lics/scripts/restore.sh /ruta/al/respaldo
```

La restauración requiere una confirmación explícita y crea automáticamente un respaldo preventivo antes de modificar la base de datos.

---

# Windows: caídas intermitentes de conexión

Síntoma: usando la app de escritorio en Windows (ver `infra/windows/README.md`), en algún momento navegando entre pantallas aparece "No fue posible comunicarse con el sistema local", y si se sigue navegando puede llegar a quedar la pantalla en blanco.

Causa más probable, identificada con evidencia real: no es `docker.service` reiniciándose solo, es la distro `lics-wsl` completa arrancando y, segundos después de terminar de arrancar, recibiendo una orden de apagado (`poweroff.target` completo) — probablemente porque el antivirus escanea en tiempo real el disco de la distro y frena el arranque de `systemd` más allá del timeout interno de WSL2 (10 segundos). `nginx` no vuelve solo tras esto porque depende de que `backend`/`frontend` ya estén resueltos por DNS, y esa lógica de orden es de `docker compose`, no del daemon. Ver el detalle completo, con el log exacto que lo confirmó, en la sección "Problema conocido" de `infra/windows/README.md`.

Mitigación aplicada en dos capas: exclusión de Windows Defender sobre `C:\ProgramData\LICS\wsl` (automatizada en el instalador desde esta versión) y `lics-watchdog.timer`, que autocorrige cualquier servicio caído en menos de 2 minutos pase lo que pase. Si igual se repite seguido, diagnosticar en este orden, todo vía PowerShell en la Windows contra la distro `lics-wsl`:

## 1. Ver qué contenedor quedó caído

```powershell
wsl -d lics-wsl -- bash -c "cd /opt/lics/infra/docker && docker compose --env-file .env.prod -f compose.prod.yml ps -a"
```

Buscar cualquier servicio que no diga `Up`/`healthy` — típicamente `nginx`.

## 2. Ver si el daemon de Docker se está reiniciando solo

```powershell
wsl -d lics-wsl -- bash -c "systemctl status docker.service --no-pager | head -5"
```

Si el "Active: active (running) since ..." muestra pocos segundos u minutos de antigüedad sin que nadie haya tocado nada, el daemon se reinició solo.

## 3. Confirmar que el watchdog está corriendo

```powershell
wsl -d lics-wsl -- bash -c "systemctl status lics-watchdog.timer --no-pager"
```

Si no aparece o no está activo, instalarlo con `sudo /opt/lics/scripts/install-watchdog-timer.sh` dentro de la distro (ya viene instalado por defecto en imágenes doradas construidas después de esta investigación).

## 4. Levantar el servicio caído a mano (mientras se investiga la causa de fondo)

```powershell
wsl -d lics-wsl -- bash -c "cd /opt/lics/infra/docker && docker compose --env-file .env.prod -f compose.prod.yml up -d"
```

`docker compose up -d` es seguro de repetir: no reconstruye ni descarga nada, solo levanta lo que esté caído respetando el orden de dependencias.

## 5. Confirmar si es el mismo patrón (arranque + apagado a los pocos segundos)

```powershell
wsl -d lics-wsl -- bash -c "journalctl --no-pager -u docker.service -u lics-watchdog.timer -n 40"
```

Buscar `Started docker.service`/`Started lics-watchdog.timer` seguido, un minuto o dos después, de `Stopped` de ambos al mismo tiempo — eso es el patrón ya identificado (distro completa reiniciándose, no solo Docker). Si aparece, revisar la línea `WaitForBootProcess ... failed to start within 10000ms` cerca del arranque: confirma que fue el timeout de WSL2, no otra cosa.

## 6. Confirmar la exclusión de Windows Defender

```powershell
Get-MpPreference | Select-Object -ExpandProperty ExclusionPath
```

Debe aparecer `C:\ProgramData\LICS\wsl`. Si no está (por ejemplo, en una instalación hecha antes de que el instalador la agregara sola), agregarla a mano:

```powershell
Add-MpPreference -ExclusionPath "C:\ProgramData\LICS\wsl"
```