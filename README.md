# LICS

Sistema de gestión empresarial local diseñado para operar completamente offline mediante una arquitectura moderna, reproducible y orientada a producción.

El proyecto está concebido para ejecutarse en una computadora dedicada dentro de una organización, priorizando estabilidad, recuperación ante fallos, mantenibilidad y facilidad de soporte técnico antes que la implementación de funcionalidades de negocio.

Su arquitectura permite desplegar la aplicación de forma consistente mediante contenedores Docker, manteniendo separados los entornos de desarrollo y producción, y facilitando actualizaciones controladas mediante paquetes versionados.

---

# Estado del proyecto

Versión actual:

```text
0.1.0-alpha
```

Actualmente el proyecto se encuentra en fase de consolidación de infraestructura.

## Componentes implementados

- Arquitectura basada en Docker Compose.
- Base de datos PostgreSQL 17.
- Backend desarrollado con Django y Django REST Framework.
- Backend productivo ejecutado mediante Gunicorn.
- Frontend desarrollado con Next.js.
- Frontend productivo en modo standalone.
- Proxy inverso mediante Nginx.
- Configuración independiente para desarrollo y producción.
- Instalación offline mediante paquetes versionados.
- Verificación de integridad mediante SHA-256.
- Healthchecks para todos los servicios.
- Scripts de instalación, inicio, parada, reinicio, estado, respaldo y restauración.
- Generación automatizada de secretos durante la instalación inicial.
- Backups verificables.
- Restauración de prueba.
- Restauración productiva controlada.
- Generación de paquetes offline.
- Imágenes Docker `linux/amd64`.

## Componentes pendientes

Antes de comenzar la implementación de funcionalidades de negocio aún deben completarse algunos elementos de infraestructura y operación:

- configuración de arranque automático mediante systemd;
- modo kiosco para la estación de trabajo;
- configuración definitiva del sistema operativo objetivo;
- SSH para soporte técnico;
- firewall;
- validación completa sobre hardware Linux x86_64;
- backups automáticos;
- política de retención;
- actualización offline automatizada;
- rollback de actualización;
- documentación operativa final.

Las funcionalidades específicas del negocio todavía no están implementadas. El modelo de datos definitivo será diseñado después del levantamiento formal de requerimientos.

## Estado validado

La infraestructura base fue validada sobre Ubuntu Server 26.04 LTS x86_64 usando un paquete offline versionado.

Validado:

- instalación offline;
- verificación de checksums SHA-256;
- carga local de imágenes Docker;
- migraciones iniciales;
- healthchecks de PostgreSQL, backend, frontend y Nginx;
- backup manual;
- verificación de backup;
- restauración de prueba;
- restauración productiva con backup preventivo;
- parada, arranque y reinicio controlado.

Pendiente de cierre operativo:

- systemd;
- backups automáticos;
- política de retención;
- actualización offline automatizada;
- rollback;
- pruebas de apagón;
- migración a otra computadora;
- modo kiosco.

---

# Objetivos del proyecto

El desarrollo del sistema sigue los siguientes principios:

- funcionamiento completamente offline;
- despliegues reproducibles;
- separación entre desarrollo y producción;
- persistencia segura de los datos;
- recuperación ante fallos;
- actualizaciones controladas;
- respaldo y restauración verificables;
- soporte técnico simplificado;
- documentación completa;
- mantenibilidad a largo plazo.

---

# Arquitectura

```text
                 Chromium
                     │
                     ▼
            http://localhost
                     │
                     ▼
                  Nginx
               ┌─────────┐
               │         │
               ▼         ▼
          Frontend    Backend
          Next.js      Django
                           │
                           ▼
                      PostgreSQL
```

Todos los componentes se ejecutan como servicios independientes mediante Docker Compose y se comunican a través de una red interna dedicada.

Solamente Nginx publica un puerto hacia el equipo anfitrión. PostgreSQL, backend y frontend permanecen dentro de la red interna de Docker.

---

# Tecnologías

## Backend

- Python
- Django
- Django REST Framework
- Gunicorn
- WhiteNoise

## Frontend

- Next.js
- React
- TypeScript

## Infraestructura

- Docker Engine
- Docker Compose v2
- PostgreSQL 17
- Nginx
- Linux
- Git y GitHub

---

# Arquitectura del repositorio

```text
backend/
    Código fuente del backend Django.

frontend/
    Aplicación web desarrollada con Next.js.

infra/
    Configuración de Docker, Nginx y componentes de infraestructura.

scripts/
    Automatización de instalación, operación y mantenimiento.

docs/
    Documentación técnica del proyecto.

VERSION
    Versión actual del proyecto.

CHANGELOG.md
    Historial de cambios.
```

---

# Entornos

## Desarrollo

El entorno de desarrollo está diseñado para ejecutarse desde cualquier estación de trabajo compatible con Docker.

### Requisitos

- Docker Engine o Docker Desktop
- Docker Compose
- Git
- Make

### Configuración inicial

```bash
cp infra/docker/.env.example infra/docker/.env
```

Editar el archivo generado con los valores necesarios para el entorno local.

### Inicio

```bash
make up
```

### Administración

```bash
make ps
make logs
make restart
make check
make migrate
make shell
```

---

## Producción

El entorno de producción está orientado a equipos Linux x86_64 utilizando un paquete offline previamente generado.

El proceso productivo utiliza:

- imágenes Docker versionadas;
- instalación automatizada;
- generación automática de secretos;
- configuración independiente de desarrollo;
- validaciones previas de instalación;
- comprobaciones automáticas de salud.

La instalación productiva no depende del repositorio Git ni de acceso a Internet para operar.

---

# Operación

Las tareas administrativas se encuentran centralizadas en:

```text
scripts/
```

Operaciones disponibles:

- instalación inicial;
- inicio y parada del sistema;
- reinicio controlado;
- consulta de estado;
- comprobación de salud;
- creación de respaldos;
- restauración de respaldos;
- validación de respaldos;
- generación de paquetes offline.

---

# Documentación

La documentación técnica se encuentra en:

```text
docs/
```

Incluye documentación sobre:

- arquitectura;
- despliegue;
- desarrollo;
- seguridad;
- respaldo y restauración;
- proceso de actualización;
- solución de problemas;
- roadmap del proyecto;
- preparación para producción.

---

# Filosofía de desarrollo

La infraestructura constituye la base del proyecto.

Las funcionalidades específicas del negocio no se implementan hasta disponer de una plataforma estable, documentada y preparada para operar en un entorno de producción.

Las decisiones técnicas priorizan:

- estabilidad;
- seguridad;
- consistencia;
- facilidad de mantenimiento;
- recuperación ante fallos;
- facilidad de soporte técnico.

Este enfoque busca reducir el riesgo operativo y facilitar la evolución del sistema a largo plazo.
