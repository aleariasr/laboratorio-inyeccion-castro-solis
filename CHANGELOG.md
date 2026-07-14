# Changelog

Todos los cambios relevantes del proyecto LICS se documentan en este archivo.

El formato utiliza estas categorías:

- Added
- Changed
- Fixed
- Removed
- Security
- Validated
- Pending

---

## [Unreleased]

### Pending

- Frontend operativo mínimo.
- Validación con usuarios reales.
- Validación con datos reales.
- Validación final en Linux Mint XFCE o Ubuntu Desktop gráfico.
- Validación completa del modo kiosco en el equipo objetivo.
- Hardening final de SSH y firewall.
- Copia externa de respaldos a USB o disco externo.
- Migración legacy DBF con archivos reales o muestras representativas.
- Documentos PDF adicionales según validación real.
- Caja y procesos financieros si el levantamiento lo confirma.

---

## [0.2.0-alpha] - 2026-07-14

### Added

- Backend base funcional.
- Autenticación con token.
- Login.
- Logout.
- Endpoint de usuario actual.
- Administración básica de usuarios.
- Roles base del sistema.
- Creación idempotente de roles base.
- Permisos por módulo.
- Usuario de solo lectura.
- Endpoint administrativo de estado del sistema.
- Dominio de inventario base.
- Ubicaciones físicas.
- Productos.
- Referencias o códigos alternos de producto.
- Proveedores.
- Referencias proveedor-producto.
- Compras.
- Líneas de compra.
- Confirmación de compras.
- Anulación de compras.
- Auditoría de confirmación y anulación de compras.
- Costos de importación.
- Categorías de costos de importación.
- Resumen calculado de costos por compra.
- Historial de costos append-only.
- Ventas.
- Líneas de venta.
- Confirmación de ventas.
- Anulación de ventas.
- Validación de stock suficiente antes de confirmar ventas.
- Reversa de stock al anular ventas confirmadas.
- Auditoría de confirmación y anulación de ventas.
- Clientes.
- Inyectores.
- Registros de servicio de inyectores.
- Accesorios de inyectores.
- Relación entre servicios y accesorios.
- Conteo físico de inventario.
- Aprobación de conteo físico.
- Ajustes auditables por diferencia de conteo.
- Búsqueda universal.
- Reportes JSON iniciales.
- Módulo inicial de documentos PDF.
- Generación de etiquetas PDF de productos.
- Códigos de barras reales Code128 en etiquetas PDF.
- Dependencia `reportlab`.
- Tests automatizados para módulos principales del backend.
- Documento de cierre de backend base.
- Índice general de documentación.

### Changed

- Se actualizó la versión del proyecto a `0.2.0-alpha`.
- Se actualizó el README para reflejar el estado real del proyecto.
- Se documentó el backend base como cerrado.
- Se actualizó el roadmap según el avance real.
- Se actualizó la lista de preparación para producción.
- Se actualizó la documentación de despliegue con el estado real de validación.
- Se marcó el cierre de infraestructura como documento histórico.
- Se actualizó la documentación del dominio de inventario con el estado de implementación.
- Se reorganizó la documentación principal con enlaces cruzados.
- Se reforzó la regla de no seguir agregando backend por suposición antes de validar con frontend y usuarios reales.

### Validated

- Django system check sin errores.
- Suite backend con 226 tests ejecutada correctamente.
- Generación de etiquetas PDF validada mediante tests.
- Códigos de barras reales Code128 agregados y cubiertos por pruebas funcionales.
- Documentación actualizada y versionada.
- Cambios subidos a `origin/main`.

### Pending

- Frontend operativo mínimo.
- Validación con flujos reales.
- Validación con usuarios reales.
- Validación con datos reales.
- Instalación limpia en Linux Mint XFCE o Ubuntu Desktop gráfico.
- Hardening final del sistema operativo.
- Copia externa de respaldos.
- Migración DBF legacy.
- Documentos PDF adicionales.
- Caja y procesos financieros si el negocio lo confirma.

---

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