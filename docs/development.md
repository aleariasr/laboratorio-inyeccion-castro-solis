# Desarrollo

## 1. Preparación

Copiar la plantilla de variables:

```bash
cp infra/docker/.env.example infra/docker/.env
```

Editar el archivo y reemplazar todos los valores provisionales.

## 2. Levantar servicios

```bash
make up
```

## 3. Detener servicios

```bash
make down
```

El comando elimina los contenedores y la red, pero conserva los volúmenes persistentes.

## 4. Estado de servicios

```bash
make ps
```

## 5. Logs

```bash
make logs
```

Para un servicio concreto:

```bash
docker compose -f infra/docker/compose.yml logs -f backend
```

## 6. Django

Validar configuración:

```bash
make check
```

Aplicar migraciones:

```bash
make migrate
```

Crear migraciones:

```bash
make makemigrations
```

Abrir una terminal en el backend:

```bash
make shell
```

## 7. PostgreSQL

Abrir `psql`:

```bash
make db
```

## 8. Healthcheck

```bash
curl http://localhost/api/health/
```

## 9. Validación de Docker Compose

Antes de confirmar cambios en la infraestructura:

```bash
docker compose -f infra/docker/compose.yml config
```

## 10. Correr scripts de `scripts/` contra desarrollo

Todos los scripts de `scripts/` apuntan a **producción** por defecto
(`scripts/lib/common.sh`):

```bash
COMPOSE_FILE="${LICS_COMPOSE_FILE:-${PROJECT_ROOT}/infra/docker/compose.prod.yml}"
ENV_FILE="${LICS_ENV_FILE:-${PROJECT_ROOT}/infra/docker/.env.prod}"
```

Los dos compose declaran proyectos distintos: `compose.yml` es
`name: lics` y `compose.prod.yml` es `name: lics-prod`. Por eso un script
corrido contra el stack de desarrollo (`make up`) falla con:

```
[ERROR] El servicio backend no quedó saludable en 60 segundos. Estado: missing
```

No es un error del script: `compose ps -q <servicio>` no devuelve nada
porque el proyecto productivo no tiene contenedores levantados.

Para apuntarlos al stack de desarrollo:

```bash
export LICS_COMPOSE_FILE="$PWD/infra/docker/compose.yml"
export LICS_ENV_FILE="$PWD/infra/docker/.env.prod"
```

Sí, el compose de desarrollo con el `.env` de producción. Es la
combinación que funciona:

- `compose.yml` solo interpola `POSTGRES_DB`, `POSTGRES_USER` y
  `POSTGRES_PASSWORD`, las tres están en `.env.prod`;
- `.env.prod` no define `COMPOSE_PROJECT_NAME`, así que manda el
  `name: lics` del propio `compose.yml` y el script encuentra los
  contenedores de desarrollo;
- el `.env` de desarrollo **no** sirve: le faltan `LICS_VERSION` y
  `HTTP_PORT`, que `validate_environment_file` exige;
- las contraseñas difieren entre los dos archivos, pero no importa:
  `backup.sh` corre `pg_dump` dentro del contenedor de postgres por
  socket local, sin pasar contraseña.

Acordate de `unset LICS_COMPOSE_FILE LICS_ENV_FILE` al terminar, y de
borrar los respaldos que queden en `backups/` de esas pruebas.

## 11. Reglas

- No instalar dependencias Python globalmente.
- No instalar dependencias Node globalmente para ejecutar el proyecto.
- No subir archivos `.env`.
- No desarrollar directamente en producción.
- No ejecutar migraciones productivas sin backup.
- No modificar datos reales manualmente sin registrar la intervención.
