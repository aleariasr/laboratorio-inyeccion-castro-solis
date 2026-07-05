# Changelog

## [0.1.0-alpha] - 2026-07-05

### Added

- Runtime productivo mediante Docker Compose.
- Imágenes productivas `linux/amd64`.
- PostgreSQL 17 con volumen persistente.
- Backend Django ejecutado mediante Gunicorn.
- Frontend Next.js en modo standalone.
- Proxy local Nginx.
- Healthchecks para PostgreSQL, backend, frontend y Nginx.
- Configuración productiva separada.
- Versionado central mediante archivo `VERSION`.
- Scripts de inicio, detención, reinicio, estado y healthcheck.
- Backup lógico PostgreSQL con metadatos y SHA-256.
- Verificación independiente de backups.
- Restauración de prueba en base temporal.
- Restauración productiva con backup preventivo y confirmación interactiva.
- Preflight para Linux x86_64.
- Generador de releases offline.
- Exportación de imágenes Docker amd64.
- Manifiesto y checksums para releases.
- Instalador offline inicial.

### Validated

- Persistencia después de reinicios.
- Detención idempotente.
- Recuperación de servicios.
- Detección de servicios caídos.
- Integridad de archivos estáticos.
- Detección de backups corruptos.
- Restauración en base temporal.
- Restauración productiva completa.
- Recuperación posterior a restore.
- Paquete offline sin secretos.
- Checksums completos del release.

### Pending

- Prueba del instalador en Linux x86_64 limpio.
- Servicio systemd.
- Chromium en modo kiosco.
- SSH y firewall.
- Backup automático.
- Actualizaciones offline.
- Rollback.
- Levantamiento de requerimientos.
- Autenticación, roles y configuración empresarial.
- Módulos de negocio.

Todos los cambios relevantes del proyecto se documentarán en este archivo.

El formato utiliza las categorías:

- Added
- Changed
- Fixed
- Removed
- Security

## [Unreleased]

### Added

- Infraestructura inicial con Docker Compose.
- PostgreSQL 17.
- Backend Django con Django REST Framework.
- Frontend Next.js.
- Proxy inverso Nginx.
- Endpoint de salud.
- Healthchecks para los servicios.
- Documentación técnica inicial.

### Changed

- Se limitaron los puertos publicados al proxy Nginx.
- Se ubicaron los Dockerfiles junto a cada servicio.

### Removed

- Archivos generados por defecto que no forman parte del producto.
- Scripts vacíos sin implementación.
- Configuración productiva vacía.
