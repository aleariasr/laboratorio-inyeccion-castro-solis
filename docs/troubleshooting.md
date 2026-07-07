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