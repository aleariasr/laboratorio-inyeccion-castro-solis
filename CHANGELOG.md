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

### Added

- Cimientos visuales y sistema de diseño del frontend.
- Cliente API tipado con manejo centralizado de errores.
- Autenticación: login, sesión y cierre de sesión desde la interfaz.
- Pantalla administrativa de estado del sistema.
- Estructura común de navegación de la aplicación (`AppShell`).
- Módulo de productos: listado, detalle, creación, edición, referencias equivalentes, historial de movimientos de stock y generación de etiquetas PDF.
- Módulo de ubicaciones: listado, creación y edición.
- Búsqueda universal desde la interfaz, con atajo de teclado.
- Módulo de proveedores: listado, detalle, creación, edición y gestión de productos asociados.
- Módulo de compras: listado con filtros (búsqueda, proveedor, estado, moneda, fecha, activo/inactivo), detalle, creación, edición de borrador, líneas de compra, confirmación y anulación con motivo obligatorio.
- Módulo de costos de importación: categorías con filtros, costos por compra con tipo de cambio propio, resumen de costos con desglose de precio sugerido por producto, aplicación de costos a productos e histórico append-only con equivalente en colones.
- Módulo de ventas: listado con filtros (búsqueda por cliente, cliente, estado, moneda, fecha, activo/inactivo), detalle, creación, edición de borrador, líneas de venta con referencia de precio sugerido desde el histórico de costos y validación de stock disponible, confirmación y anulación con motivo obligatorio.
- Módulo de clientes: listado con filtros (búsqueda, tipo, activo/inactivo), detalle con inyectores y ventas relacionadas, creación y edición.
- Módulo de inyectores y servicios: inyectores (listado, detalle, creación, edición) y bandeja operativa de servicios de inyector (recepción, inicio, marcar listo, entrega y anulación), con datos técnicos editables mientras el servicio está abierto y gestión de accesorios utilizados con catálogo creado en línea.
- Módulo de conteos físicos: listado con filtros (búsqueda por referencia, estado, rango de fechas, activo/inactivo), creación, captura rápida de líneas (búsqueda de producto, cantidad, avance con `Enter`, prevención de duplicados), diferencia visible contra el stock actual del sistema, edición y eliminación de líneas mientras el conteo está en borrador, aprobación (genera automáticamente movimientos de ajuste de inventario por cada diferencia) y anulación (acción nueva en el backend; antes solo existía aprobar y el estado `CANCELLED` no era alcanzable desde la API).

### Fixed

- Validación de nombre de proveedor duplicado: ahora detecta coincidencias sin distinguir mayúsculas de minúsculas antes de llegar a la base de datos, evitando un error 500 no controlado.
- Cálculo de costos de importación en moneda distinta a la de la compra: ahora convierte correctamente usando el tipo de cambio propio de cada costo (siempre expresado en colones por dólar), en vez de sumar montos de monedas distintas como si valieran lo mismo.
- Columna "Calculado" del histórico de costos: mostraba la fecha ISO sin formatear.
- Validación de identificación duplicada de clientes: antes solo se aplicaba al crear un cliente; ahora también se aplica al editar, evitando que dos clientes queden con la misma identificación.
- Validación de número de inyector duplicado por cliente: antes solo se aplicaba al crear; editar un inyector hacia un número ya usado por el mismo cliente producía un error 500 no controlado en vez de un error de validación.

### Pending

- Reportes desde la interfaz.
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