# Sistema de Gestión Local

Sistema local offline para la gestión operativa del Laboratorio de Inyección Castro Solís.

El sistema se ejecuta en una computadora dedicada y utiliza una arquitectura web local basada en Docker Compose. No depende de conexión permanente a Internet para operar.

## Estado actual

El proyecto se encuentra en fase de infraestructura.

Servicios disponibles:

- PostgreSQL 17
- Django y Django REST Framework
- Next.js
- Nginx
- Healthchecks de infraestructura

Las funcionalidades de negocio todavía no están implementadas. El modelo de datos se definirá después del levantamiento formal de requerimientos.

## Arquitectura

```text
Chromium en modo kiosco
          |
          v
 http://localhost
          |
          v
        Nginx
       /     \
      v       v
 Next.js    Django API
                |
                v
           PostgreSQL
```

## Requisitos de desarrollo

- Docker Desktop o Docker Engine
- Docker Compose
- Git
- Make

No es necesario instalar Python, PostgreSQL ni Node.js directamente en la computadora de desarrollo.

## Inicio rápido

Crear el archivo local de configuración:

```bash
cp infra/docker/.env.example infra/docker/.env
```

Editar las contraseñas y secretos:

```bash
nano infra/docker/.env
```

Levantar el sistema:

```bash
make up
```

Verificar servicios:

```bash
make ps
```

Comprobar la API:

```bash
curl http://localhost/api/health/
```

Abrir la aplicación:

```text
http://localhost
```

## Comandos principales

```bash
make up
make down
make restart
make logs
make ps
make check
make migrate
make makemigrations
make shell
make db
```

## Documentación

- [Arquitectura](docs/architecture.md)
- [Desarrollo](docs/development.md)
- [Despliegue](docs/deployment.md)
- [Seguridad](docs/security.md)
- [Backups y restauración](docs/backup-restore.md)
- [Actualizaciones](docs/update-process.md)
- [Solución de problemas](docs/troubleshooting.md)
- [Roadmap](docs/roadmap.md)

## Estado del producto

El sistema no está listo para producción ni para almacenar información real del cliente.

Antes de la primera instalación productiva deberán completarse, como mínimo:

- configuración separada de producción;
- autenticación y autorización;
- backups automáticos;
- restauración probada;
- actualización y rollback;
- endurecimiento del sistema operativo;
- pruebas automatizadas;
- manejo y rotación de logs;
- documentación de operación.
