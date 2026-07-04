# Solución de problemas

## Revisar servicios

```bash
make ps
```

## Revisar logs

```bash
make logs
```

## Validar Docker Compose

```bash
docker compose -f infra/docker/compose.yml config
```

## Verificar API

```bash
curl http://localhost/api/health/
```

## Verificar Django

```bash
make check
```

## Reiniciar servicios

```bash
make restart
```

## Nginx no responde

```bash
docker compose -f infra/docker/compose.yml logs nginx
```

## Backend no responde

```bash
docker compose -f infra/docker/compose.yml logs backend
```

## Frontend no responde

```bash
docker compose -f infra/docker/compose.yml logs frontend
```

## PostgreSQL no está saludable

```bash
docker compose -f infra/docker/compose.yml logs postgres
```

No deben eliminarse volúmenes como intento de solución sin tener un backup válido y autorización explícita.
