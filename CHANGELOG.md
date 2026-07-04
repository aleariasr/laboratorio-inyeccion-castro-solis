# Changelog

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
