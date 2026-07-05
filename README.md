# Sistema de Gestión Local

Sistema local offline para la gestión operativa del Laboratorio de Inyección Castro Solís.

El sistema está diseñado para ejecutarse en una computadora dedicada dentro del negocio, sin depender de una conexión permanente a Internet.

La aplicación utiliza una arquitectura web local basada en Docker Compose y será operada desde Chromium en modo kiosco.

## Estado actual

Versión actual:

```text
0.1.0-alpha
```

El proyecto se encuentra en etapa de infraestructura, instalación y operación técnica.

La base productiva ya incluye:

- PostgreSQL 17;
- backend Django;
- Django REST Framework;
- Gunicorn;
- frontend Next.js en modo standalone;
- Nginx como proxy local;
- Docker Compose de producción;
- healthchecks;
- persistencia de datos;
- scripts operativos;
- backups verificables;
- restauración de prueba;
- restauración productiva;
- generación de paquetes offline;
- imágenes `linux/amd64`;
- preflight de instalación;
- instalador offline inicial.

Las funcionalidades de negocio todavía no están implementadas.

No se ha definido el modelo de datos definitivo para inventario, ventas, caja, clientes, proveedores ni reportes, porque primero se realizará el levantamiento formal de requerimientos reales del cliente.

## Arquitectura objetivo

```text
Chromium en modo kiosco
          |
          v
 http://127.0.0.1
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

Servicios productivos:

```text
postgres
backend
frontend
nginx
```

Solamente Nginx publica un puerto en la computadora anfitriona.

PostgreSQL, backend y frontend permanecen dentro de la red interna de Docker.

## Tecnologías

### Backend

- Python
- Django
- Django REST Framework
- Gunicorn
- WhiteNoise

### Frontend

- Next.js
- React
- TypeScript

### Infraestructura

- Docker Engine
- Docker Compose v2
- PostgreSQL 17
- Nginx
- Linux
- Git y GitHub

## Plataforma objetivo

Producción:

- Linux Mint XFCE o Ubuntu Desktop minimal;
- arquitectura `x86_64`;
- Docker Engine;
- Docker Compose v2;
- systemd;
- Chromium;
- SSH para soporte técnico.

Desarrollo:

- macOS, Linux o Windows con Docker;
- Git;
- Make.

No es necesario instalar directamente Python, PostgreSQL ni Node.js para ejecutar el entorno mediante Docker.

## Estructura principal

```text
backend/
frontend/
infra/
  docker/
  nginx/
scripts/
docs/
VERSION
CHANGELOG.md
README.md
```

## Desarrollo local

Crear el archivo de configuración de desarrollo:

```bash
cp infra/docker/.env.example infra/docker/.env
```

Editar las variables locales:

```bash
nano infra/docker/.env
```

Levantar el entorno:

```bash
make up
```

Consultar servicios:

```bash
make ps
```

Comprobar el backend:

```bash
curl http://localhost/api/health/
```

Abrir la aplicación:

```text
http://localhost
```

## Comandos de desarrollo

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

## Runtime productivo local

La configuración productiva utiliza:

```text
infra/docker/compose.prod.yml
```

El archivo local de secretos es:

```text
infra/docker/.env.prod
```

Ese archivo:

- no se guarda en Git;
- no se incluye en releases;
- contiene secretos locales;
- debe tener permisos restrictivos;
- se genera durante la instalación.

Los servicios productivos no deben hacer `docker pull` ni construir imágenes en la computadora del cliente.

## Scripts operativos

### Inicio

```bash
./scripts/start.sh
```

### Detención segura

```bash
./scripts/stop.sh
```

### Reinicio

```bash
./scripts/restart.sh
```

### Estado

```bash
./scripts/status.sh
```

### Healthcheck

```bash
./scripts/healthcheck.sh
```

Los scripts de operación preservan:

- datos;
- volúmenes;
- imágenes;
- redes;
- configuración local.

## Backups

Crear un backup manual:

```bash
./scripts/backup.sh manual
```

Tipos disponibles:

```text
manual
daily
weekly
pre-update
pre-restore
```

Cada respaldo contiene:

```text
database.dump
metadata.txt
SHA256SUMS
```

Los respaldos utilizan `pg_dump` en formato custom y son verificados antes de publicarse.

## Verificación de backups

```bash
./scripts/verify-backup.sh /ruta/al/backup
```

La verificación comprueba:

- archivos requeridos;
- checksums;
- tamaño;
- metadatos;
- versión;
- base de datos;
- formato de PostgreSQL.

## Restauración de prueba

```bash
./scripts/test-restore.sh /ruta/al/backup
```

La restauración de prueba:

- crea una base temporal;
- restaura el backup;
- valida migraciones;
- valida tablas;
- elimina la base temporal;
- no modifica producción.

## Restauración productiva

```bash
./scripts/restore.sh /ruta/al/backup
```

La restauración productiva:

- verifica el respaldo;
- solicita confirmación interactiva;
- crea un backup preventivo;
- detiene los servicios de aplicación;
- restaura PostgreSQL;
- valida tablas y migraciones;
- reinicia el sistema;
- ejecuta un healthcheck final.

## Release offline

Generar un paquete para Linux `amd64`:

```bash
./scripts/build-offline-release.sh
```

La salida se crea en:

```text
release/lics-<version>-linux-amd64/
```

Contenido principal:

```text
app/
images/
manifest.txt
SHA256SUMS
VERSION
```

El release incluye:

- aplicación versionada;
- scripts operativos;
- instalador;
- imágenes Docker;
- manifiesto;
- checksums.

Los releases no se guardan en Git.

## Instalación offline

Desde la raíz del paquete de release:

```bash
sudo ./app/scripts/install.sh
```

El instalador:

1. verifica checksums;
2. ejecuta el preflight;
3. valida Linux `x86_64`;
4. carga las imágenes offline;
5. instala en `/opt/lics`;
6. genera secretos;
7. inicia PostgreSQL;
8. ejecuta migraciones;
9. levanta los servicios;
10. ejecuta el healthcheck final.

El instalador todavía debe validarse en una máquina Linux `x86_64` limpia antes de considerarse aprobado para producción.

## Seguridad

Principios aplicados:

- secretos excluidos de Git;
- `.env.prod` excluido de releases;
- PostgreSQL sin puerto público;
- aplicación enlazada a localhost;
- usuarios no root en contenedores de aplicación;
- checksums de backups;
- checksums de releases;
- backups antes de restauraciones;
- operaciones destructivas con confirmación;
- volúmenes persistentes;
- separación entre desarrollo y producción.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Desarrollo](docs/development.md)
- [Despliegue](docs/deployment.md)
- [Seguridad](docs/security.md)
- [Backups y restauración](docs/backup-restore.md)
- [Actualizaciones](docs/update-process.md)
- [Solución de problemas](docs/troubleshooting.md)
- [Roadmap](docs/roadmap.md)
- [Cierre de infraestructura](docs/infrastructure-stage-closure.md)
- [Lista de preparación para producción](docs/production-readiness-checklist.md)
- [Historial de cambios](CHANGELOG.md)

## Estado de preparación

Completado:

- runtime productivo;
- healthchecks;
- persistencia;
- scripts operativos;
- backup manual;
- verificación de backups;
- restauración temporal;
- restauración productiva;
- release offline;
- preflight;
- instalador inicial;
- documentación de infraestructura.

Pendiente antes de instalar en el negocio:

- prueba limpia en Linux `x86_64`;
- servicio systemd;
- arranque automático;
- Chromium en modo kiosco;
- recuperación automática del kiosco;
- SSH;
- firewall;
- backups automáticos;
- retención de backups;
- actualización offline;
- rollback;
- exportación de logs;
- pruebas de apagado inesperado;
- migración a otra computadora.

Pendiente antes de implementar módulos de negocio:

- levantamiento de requerimientos;
- validación de procesos;
- definición de actores;
- reglas de negocio;
- historias de usuario;
- criterios de aceptación;
- diseño del modelo de datos.

## Estado del producto

El sistema todavía no está listo para almacenar información real del cliente ni para ser entregado como producto final.

La infraestructura base está implementada y documentada, pero la aprobación productiva depende de completar las pruebas de instalación, recuperación, autostart, actualización y operación en Linux.
