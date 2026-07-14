# Índice de documentación

Este directorio contiene la documentación técnica, operativa y funcional del proyecto LICS.

LICS es un sistema local/offline orientado a producción real. La documentación debe mantenerse actualizada porque forma parte del soporte técnico, la recuperación ante fallos y la entrega controlada del sistema.

---

# Lectura recomendada

1. [README principal](../README.md)
2. [Cierre de backend base](backend-base-closure.md)
3. [Roadmap](roadmap.md)
4. [Arquitectura del sistema](architecture.md)
5. [Modelo de datos](data-model.md)
6. [Dominio de inventario](domain/inventory.md)
7. [Desarrollo](development.md)
8. [Despliegue](deployment.md)
9. [Backups y restauración](backup-restore.md)
10. [Proceso de actualización](update-process.md)
11. [Seguridad](security.md)
12. [Solución de problemas](troubleshooting.md)
13. [Lista de preparación para producción](production-readiness-checklist.md)

---

# Documentos de estado

## Cierre de backend base

Archivo:

- [backend-base-closure.md](backend-base-closure.md)

Propósito:

Documenta el cierre del backend base en versión `0.2.0-alpha`.

Incluye:

- alcance implementado;
- endpoints principales;
- validación técnica;
- decisiones importantes;
- pendientes posteriores.

## Cierre de infraestructura productiva base

Archivo:

- [infrastructure-stage-closure.md](infrastructure-stage-closure.md)

Propósito:

Registra el cierre histórico de la etapa de infraestructura productiva base.

Incluye:

- instalación offline;
- healthchecks;
- backups;
- restauración;
- actualización;
- rollback;
- pruebas sobre Linux x86_64.

## Lista de preparación para producción

Archivo:

- [production-readiness-checklist.md](production-readiness-checklist.md)

Propósito:

Define los criterios mínimos para considerar una versión apta para producción.

Incluye:

- infraestructura;
- instalación;
- backups;
- restauración;
- seguridad;
- actualizaciones;
- frontend;
- validación operativa.

## Roadmap

Archivo:

- [roadmap.md](roadmap.md)

Propósito:

Define el avance por fases del proyecto y el orden recomendado de implementación.

---

# Documentos técnicos

## Arquitectura del sistema

Archivo:

- [architecture.md](architecture.md)

Propósito:

Describe la arquitectura general del sistema.

Incluye:

- Nginx;
- Next.js;
- Django REST Framework;
- PostgreSQL;
- Docker Compose;
- separación entre desarrollo y producción.

## Modelo de datos

Archivo:

- [data-model.md](data-model.md)

Propósito:

Describe el modelo conceptual y las reglas de datos del sistema.

Incluye:

- usuarios;
- permisos;
- inventario;
- compras;
- costos;
- ventas;
- clientes;
- inyectores;
- documentos PDF;
- reportes;
- búsqueda universal;
- migración DBF legacy.

## Dominio de inventario

Archivo:

- [domain/inventory.md](domain/inventory.md)

Propósito:

Documenta las reglas específicas del dominio de inventario.

Incluye:

- productos;
- ubicaciones;
- referencias;
- proveedores;
- compras;
- costos;
- movimientos de stock;
- servicios;
- selectors;
- reglas de negocio.

## Estructura de instalación en producción

Archivo:

- [production-layout.md](production-layout.md)

Propósito:

Describe la estructura esperada de una instalación productiva local.

Incluye:

- `/opt/lics`;
- scripts operativos;
- evolución futura de estructura versionada.

---

# Documentos operativos

## Desarrollo

Archivo:

- [development.md](development.md)

Propósito:

Explica cómo trabajar en el entorno de desarrollo.

Incluye:

- preparación del `.env`;
- levantar servicios;
- detener servicios;
- logs;
- comandos Django;
- PostgreSQL;
- healthcheck;
- reglas de desarrollo.

## Despliegue

Archivo:

- [deployment.md](deployment.md)

Propósito:

Explica el despliegue del sistema en un equipo dedicado de producción.

Incluye:

- plataforma objetivo;
- instalación offline;
- directorio de instalación;
- separación de entornos;
- requisitos productivos;
- preflight.

## Backups y restauración

Archivo:

- [backup-restore.md](backup-restore.md)

Propósito:

Documenta la estrategia de respaldo y restauración.

Incluye:

- `pg_dump`;
- validación con `pg_restore`;
- metadatos;
- checksums;
- restauración controlada;
- backup preventivo;
- política de retención.

## Proceso de actualización

Archivo:

- [update-process.md](update-process.md)

Propósito:

Describe cómo actualizar una instalación existente de forma segura y offline.

Incluye:

- paquete de actualización;
- validaciones previas;
- backup obligatorio;
- migraciones;
- healthcheck posterior;
- recuperación ante fallos.

## Seguridad

Archivo:

- [security.md](security.md)

Propósito:

Define los principios y controles de seguridad del sistema.

Incluye:

- secretos fuera de Git;
- red interna;
- SSH;
- Django en producción;
- operadores;
- controles implementados;
- controles pendientes.

## Solución de problemas

Archivo:

- [troubleshooting.md](troubleshooting.md)

Propósito:

Resume comandos y procedimientos para diagnosticar problemas.

Incluye:

- estado de servicios;
- logs;
- healthcheck;
- PostgreSQL;
- backend;
- frontend;
- Nginx;
- verificación y restauración de respaldos.

---

# Estado actual

Versión actual:

    0.2.0-alpha

Estado resumido:

    Infraestructura productiva base: implementada.
    Backend base: cerrado.
    Frontend operativo: pendiente.
    Validación con usuarios reales: pendiente.
    Migración DBF legacy: pendiente.

La siguiente fase recomendada es construir el frontend operativo mínimo para validar el sistema con pantallas reales y flujos del negocio antes de ampliar más módulos backend.

---

# Regla de mantenimiento documental

Todo cambio importante del sistema debe reflejarse en la documentación correspondiente.

Ejemplos:

- cambios de arquitectura;
- cambios de instalación;
- nuevos scripts;
- cambios en backup o restore;
- cambios en actualización;
- nuevas apps backend;
- nuevos endpoints;
- nuevas reglas de negocio;
- cambios de permisos;
- cambios en la estrategia de producción.

La documentación forma parte del sistema de producción y debe versionarse junto con el código.
