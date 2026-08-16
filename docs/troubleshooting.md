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

Causa raíz confirmada (con uso real extendido, no solo teoría): WSL2 apagaba la distro `lics-wsl` completa (todo `systemd`, no solo Docker) segundos después de terminar de arrancar, cuando no quedaba ningún proceso `wsl.exe` conectado como cliente — la única tarea programada que arrancaba la distro corría `start.sh` y terminaba en cuanto ese script terminaba, sin dejar ningún cliente detrás. `nginx` no volvía solo tras esto porque depende de que `backend`/`frontend` ya estén resueltos por DNS, y esa lógica de orden es de `docker compose`, no del daemon. Ver el detalle completo, con el log exacto que lo confirmó, en la sección "Problema conocido" de `infra/windows/README.md`.

Fix aplicado: una segunda tarea programada ("LICS - Mantener sesion WSL activa") mantiene un `wsl.exe -d lics-wsl -- sleep infinity` corriendo de forma indefinida, así WSL2 nunca ve la distro sin clientes. Si esto vuelve a aparecer, diagnosticar en este orden, todo vía PowerShell en la Windows:

## 1. Confirmar que la tarea de mantener sesión está activa

```powershell
Get-ScheduledTask -TaskName 'LICS - Mantener sesion WSL activa' | Get-ScheduledTaskInfo
Get-Process wsl -ErrorAction SilentlyContinue
```

Si la tarea no existe, no está habilitada, o no hay ningún proceso `wsl.exe` corriendo, ese es el problema — instalarla o reactivarla (ver `infra/windows/electron/resources/windows/register-scheduled-task.ps1`, o correrla directo: `Start-ScheduledTask -TaskName 'LICS - Mantener sesion WSL activa'`).

## 2. Ver qué contenedor quedó caído

```powershell
wsl -d lics-wsl -- bash -c "cd /opt/lics/infra/docker && docker compose --env-file .env.prod -f compose.prod.yml ps -a"
```

Buscar cualquier servicio que no diga `Up`/`healthy` — típicamente `nginx`.

## 3. Confirmar que el watchdog está corriendo (red de seguridad adicional)

```powershell
wsl -d lics-wsl -- bash -c "systemctl status lics-watchdog.timer --no-pager"
```

Si no aparece o no está activo, instalarlo con `sudo /opt/lics/scripts/install-watchdog-timer.sh` dentro de la distro (ya viene instalado por defecto en imágenes doradas construidas después de esta investigación).

## 4. Levantar el servicio caído a mano mientras se resuelve lo de arriba

```powershell
wsl -d lics-wsl -- bash -c "cd /opt/lics/infra/docker && docker compose --env-file .env.prod -f compose.prod.yml up -d"
```

`docker compose up -d` es seguro de repetir: no reconstruye ni descarga nada, solo levanta lo que esté caído respetando el orden de dependencias.

## 5. Confirmar si es el mismo patrón (arranque + apagado a los pocos segundos)

```powershell
wsl -d lics-wsl -- bash -c "journalctl --no-pager -u docker.service -u lics-watchdog.timer -n 40"
```

Buscar `Started docker.service`/`Started lics-watchdog.timer` seguido, un minuto o dos después, de `Stopped` de ambos al mismo tiempo — eso es el patrón de la distro completa apagándose. Si aparece junto con el paso 1 mostrando que no hay ningún `wsl.exe` corriendo, es exactamente esta causa reapareciendo (la tarea de mantener sesión se cayó o nunca se activó).