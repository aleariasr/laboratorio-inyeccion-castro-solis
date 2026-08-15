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

Causa raíz confirmada en al menos una investigación real: `docker.service` (el daemon, no un contenedor) se reinicia solo dentro de la distro WSL2. `nginx` no vuelve solo después de ese reinicio porque depende de que `backend`/`frontend` ya estén resueltos por DNS, y esa lógica de orden es de `docker compose`, no del daemon. Ver el detalle completo, lo confirmado y lo que quedó sin explicar, en la sección "Problema conocido" de `infra/windows/README.md`.

Desde la versión con `lics-watchdog.timer` instalado, esto se autocorrige solo en menos de 2 minutos. Si igual se repite seguido, diagnosticar en este orden, todo vía PowerShell en la Windows contra la distro `lics-wsl`:

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