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
- Módulo de movimientos de inventario: `StockMovementViewSet` ya no exige `product` (antes era obligatorio) y ahora acepta filtros opcionales por ubicación, tipo, dirección, rango de fechas, compra, venta y conteo físico, con ordenamiento configurable; `StockMovement` gana una FK opcional a `InventoryCount` para vincular cada ajuste generado por un conteo físico con el conteo que lo originó. Pantalla `/inventory/movements`: listado general paginado con esos mismos filtros y modo kardex automático (saldo corriente) al filtrar por un solo producto; cada movimiento enlaza a su origen (compra, venta o conteo físico). Reporte de stock por ubicación (`GET /api/reports/stock-by-location/`, ya existente en el backend) conectado a una pantalla propia (`/inventory/stock-by-location`), accesible por URL sin entrada de menú por solaparse con el filtro de ubicación ya existente en Productos.
- `infra/systemd/lics-watchdog.service` y `lics-watchdog.timer`, instalados por `scripts/install-watchdog-timer.sh`: corren `start.sh` cada 2 minutos dentro de la distro para reconciliar cualquier servicio productivo (típicamente `nginx`) que haya quedado caído tras un reinicio inesperado del daemon de Docker. Ver `infra/windows/README.md` (sección "Problema conocido") para el detalle de la investigación.
- `infra/windows/wsl/cut-release.ps1`: un solo comando en la Windows que detecta la carpeta de release offline más nueva en `C:\lics-dev\`, reconstruye la imagen dorada y dispara el workflow de Actions (`gh workflow run`, si está disponible GitHub CLI).
- Target `make release` como atajo de `scripts/build-offline-release.sh`.
- Validación en Windows 11 real de la app de escritorio (`infra/windows/`): imagen dorada, instalador `.exe` vía runner self-hosted de GitHub Actions, instalación, primera sesión y uso real.
- Tarea programada "LICS - Mantener sesion WSL activa" en `register-scheduled-task.ps1`: mantiene un proceso `wsl.exe` conectado a la distro de forma indefinida para evitar que WSL2 la apague por quedarse sin clientes (causa raíz real de las caídas intermitentes de conexión — ver Fixed).
- `create_initial_admin()` en `provision-golden-image.sh`: crea automáticamente un usuario `admin` con contraseña aleatoria (`openssl rand -base64 24`) al construir la imagen dorada, en vez de requerir `createsuperuser` manual tras cada instalación. La contraseña queda en `/opt/lics/ADMIN_CREDENTIALS_INICIALES.txt` (permisos 600, solo root) con instrucciones de cambiarla de inmediato; si ese archivo ya existe no se genera otro admin. Todas las instalaciones hechas desde la misma imagen dorada comparten esa contraseña hasta que se cambie.

### Fixed

- Validación de nombre de proveedor duplicado: ahora detecta coincidencias sin distinguir mayúsculas de minúsculas antes de llegar a la base de datos, evitando un error 500 no controlado.
- Cálculo de costos de importación en moneda distinta a la de la compra: ahora convierte correctamente usando el tipo de cambio propio de cada costo (siempre expresado en colones por dólar), en vez de sumar montos de monedas distintas como si valieran lo mismo.
- Columna "Calculado" del histórico de costos: mostraba la fecha ISO sin formatear.
- Validación de identificación duplicada de clientes: antes solo se aplicaba al crear un cliente; ahora también se aplica al editar, evitando que dos clientes queden con la misma identificación.
- Validación de número de inyector duplicado por cliente: antes solo se aplicaba al crear; editar un inyector hacia un número ya usado por el mismo cliente producía un error 500 no controlado en vez de un error de validación.
- El detalle de producto mostraba "Sin documento asociado" en ajustes generados por un conteo físico aprobado; ahora reconoce el conteo como origen.
- `build-golden-image.ps1`: el chequeo de virtualización (`Win32_Processor.VirtualizationFirmwareEnabled`) daba falso negativo en hardware real y bloqueaba la instalación aun con la BIOS/UEFI bien configurada; ahora es una advertencia, no un bloqueo — el chequeo real y definitivo es el intento de arranque de WSL2.
- `build-golden-image.ps1`: una descarga de rootfs interrumpida dejaba un archivo corrupto que el script daba por válido solo por existir; ahora se valida con `tar -tzf` (la misma herramienta que usa WSL internamente) y se reintenta la descarga si falla.
- `build-golden-image.ps1`: el script fallaba con un error de parseo de PowerShell ("Falta la cadena en el terminador") únicamente en Windows PowerShell 5.1 real, nunca en el entorno de desarrollo — causado por caracteres acentuados sin BOM UTF-8, que 5.1 decodifica mal con la codepage ANSI del sistema. Reescrito sin caracteres no-ASCII y guardado con BOM.
- `provision-golden-image.sh`: `install_docker_engine()` daba por instalado Docker Engine con solo `command -v docker`, lo cual encontraba un stub de Docker Desktop (si estaba instalado en la Windows) sin que hubiera Docker Engine real dentro de la distro; ahora exige además `dpkg -s docker-ce`.
- `build-golden-image.ps1`: aísla el `PATH` de Windows dentro de la distro (`[interop] appendWindowsPath=false` en `wsl.conf`) para que binarios del lado Windows no se filtren dentro de WSL2.
- `wsl-pro.service` (agente de Ubuntu Pro, no usado por LICS) entraba en crash-loop constante por un problema de interop tras aislar el `PATH`; se enmascara por defecto en `provision-golden-image.sh`.
- Workflow `build-windows-installer.yml`: usaba `shell: pwsh`, pero el runner self-hosted solo tiene Windows PowerShell 5.1 instalado (no PowerShell 7); cambiado a `shell: powershell`.
- Workflow `build-windows-installer.yml`: el checkout del runner es una carpeta de trabajo aislada, distinta de cualquier clon manual en la máquina, y el `.tar` de la imagen dorada está en `.gitignore` a propósito (pesa varios GB); se agregó un paso que lo copia desde `C:\lics-build\` en cada corrida.
- `npm run dist` (electron-builder) fallaba al extraer `winCodeSign` por falta de privilegio para crear symlinks (paquete trae `.dylib` de macOS aunque el build sea solo para Windows); resuelto activando el Modo de Desarrollador de Windows, no con una variable de entorno.
- Exclusión de Windows Defender faltante sobre el directorio de la distro (`C:\ProgramData\LICS\wsl`, con el `.vhdx`); el escaneo en tiempo real podía frenar el I/O. `install-wsl-distro.ps1` y `build-golden-image.ps1` la agregan automáticamente ahora. Buena práctica, pero investigación posterior confirmó que no era la causa raíz de las caídas intermitentes (ver el siguiente punto).
- **Causa raíz confirmada y resuelta de las caídas intermitentes de conexión** (ver `infra/windows/README.md`, sección "Problema conocido"): WSL2 apagaba la distro `lics-wsl` completa (todo `systemd`, no solo Docker) segundos después de terminar de arrancar, cuando no quedaba ningún proceso `wsl.exe` conectado como cliente — la única tarea programada que arrancaba la distro corría `start.sh` y terminaba en cuanto ese script terminaba, sin dejar ningún cliente conectado detrás. `systemd=true` en `wsl.conf` (correctamente configurado) no fue suficiente por sí solo en esta versión de WSL2. Confirmado con `journalctl` acotado al segundo exacto: apagado limpio de toda la distro, siempre 2 segundos después de terminar de arrancar. `register-scheduled-task.ps1` ahora registra una segunda tarea programada ("LICS - Mantener sesion WSL activa") que mantiene un `wsl.exe -d lics-wsl -- sleep infinity` corriendo de forma indefinida. Confirmado resuelto con uso real extendido tras aplicar el fix.
- Bug de foco de Electron en Windows: tras un rato de uso (o tras alt-tab, un diálogo nativo, minimizar/restaurar), los campos de texto dejaban de responder a clics aunque la ventana se veía enfocada — la ventana recuperaba el foco del sistema operativo sin que el `webContents` (el contenido web) recuperara el foco con ella. Por eso abrir y cerrar "Ver estado" "arreglaba" el síntoma: cualquier diálogo nativo forzaba el refoco. `main.js` ahora fuerza `win.webContents.focus()` cada vez que la ventana gana foco, en vez de depender de que el usuario note el síntoma y abra un diálogo.
- `provision-golden-image.sh`: `install_application()` se saltaba por completo la sincronización de la app si `/opt/lics` ya existía; reconstruir la imagen dorada sobre una distro `lics-build` ya aprovisionada no recogía una versión nueva de la app. Ahora siempre resincroniza (`cp -a` del release sobre `/opt/lics`); es seguro porque `.env.prod` no forma parte del payload del release y nunca se sobreescribe.
- `wait_for_all_services()` en `scripts/lib/common.sh`: le daba a cada uno de los 4 servicios (postgres/backend/frontend/nginx) el timeout completo por separado en vez de un presupuesto compartido, así que el peor caso real era timeout × 4 (720s con el default de 180s) — supera el `TimeoutStartSec=300` de `lics.service`, que mata el script a mitad de camino sin que el propio script llegue a loguear su error (SIGTERM/SIGKILL de systemd, no una falla de comando que un `trap ERR` pueda capturar). Ahora comparte un presupuesto total entre los 4 servicios, acotado con margen real contra `TimeoutStartSec`.

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
- `install_docker_engine()` en `provision-golden-image.sh` sigue omitiendo la reinstalación si Docker Engine ya está presente (a diferencia de `install_application()`, que ya se corrigió); no suele importar en la práctica porque la versión de Docker Engine no cambia entre releases de la app, pero queda documentado.
- Reemplazar `infra/windows/electron/build/icon.ico` (placeholder) por el logo real.
- Evaluar certificado de firma de código si SmartScreen se vuelve un problema para usuarios finales no técnicos.
- No hay puente automático de archivos entre la máquina de build y la Windows; la transferencia del release sigue siendo manual (USB, red).

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