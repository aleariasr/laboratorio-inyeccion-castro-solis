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

## 10. Reglas

- No instalar dependencias Python globalmente.
- No instalar dependencias Node globalmente para ejecutar el proyecto.
- No subir archivos `.env`.
- No desarrollar directamente en producción.
- No ejecutar migraciones productivas sin backup.
- No modificar datos reales manualmente sin registrar la intervención.
