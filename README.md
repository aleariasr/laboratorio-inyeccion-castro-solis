# LICS

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-5.2-092E20?logo=django&logoColor=white)
![Django REST Framework](https://img.shields.io/badge/DRF-3.16-A30000)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-Frontend-000000?logo=nextdotjs&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-Proxy-009639?logo=nginx&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-Offline%20Production-0078D4?logo=windows11&logoColor=white)
![ReportLab](https://img.shields.io/badge/PDF-ReportLab-red)

Sistema de gestión empresarial local diseñado para operar completamente offline en una computadora dedicada.

LICS está orientado a producción real, no a prototipo académico. Las decisiones técnicas priorizan estabilidad, mantenibilidad, seguridad, respaldo de datos, recuperación ante fallos, soporte técnico y operación local sin conexión permanente a Internet.

---

# Índice

- [Estado del proyecto](#estado-del-proyecto)
- [Capturas del sistema](#capturas-del-sistema)
- [Resumen funcional implementado](#resumen-funcional-implementado)
- [Arquitectura general](#arquitectura-general)
- [Tecnologías principales](#tecnologías-principales)
- [Arquitectura del repositorio](#arquitectura-del-repositorio)
- [Entornos](#entornos)
- [Endpoints principales](#endpoints-principales)
- [Documentación](#documentación)
- [Estado de validación](#estado-de-validación)
- [Pendientes principales](#pendientes-principales)
- [Filosofía de desarrollo](#filosofía-de-desarrollo)

---

# Estado del proyecto

Versión actual:

    2.1.0

Estado actual:

    Backend base cerrado.
    Infraestructura productiva base implementada.
    Frontend operativo completo para los flujos del negocio (login, panel de inicio accionable con
    vistos recientemente, estado del sistema, búsqueda universal ampliada, productos con variantes
    original/genérico, ubicaciones, proveedores, compras, costos de importación, ventas, clientes,
    inyectores y servicios, cierre de caja semanal con desglose por método de pago, proforma y
    facturas internas en PDF, conteos físicos, movimientos de inventario, reportes).
    Backlog de la visita al cliente (2026-09, 20 puntos): completado, salvo §5 (sin definir todavía).
    Validación con flujos y datos reales: pendiente.

El backend base ya incluye autenticación, usuarios, roles, permisos por módulo, inventario, compras, costos, ventas, clientes, inyectores, servicios, cierre de caja, búsqueda universal, reportes JSON, endpoint administrativo de estado y generación de documentos PDF (etiquetas, proforma y facturas internas) con códigos de barras reales.

Documento principal de cierre:

- [Cierre de backend base](docs/backend-base-closure.md)

---

## Acceso y panel principal

| Inicio de sesión | Panel de inicio |
|---|---|
| ![Inicio de sesión](docs/images/screenshots/login.png) | ![Panel de inicio](docs/images/screenshots/dashboard.png) |

![Búsqueda universal](docs/images/screenshots/busqueda-universal.png)

## Inventario

| Listado de productos | Producto con variantes |
|---|---|
| ![Listado de productos](docs/images/screenshots/productos-listado.png) | ![Producto con variantes](docs/images/screenshots/producto-detalle-variantes.png) |

| Ubicaciones | Movimientos (kardex) | Conteos físicos |
|---|---|---|
| ![Ubicaciones](docs/images/screenshots/ubicaciones-listado.png) | ![Movimientos de inventario](docs/images/screenshots/movimientos-inventario.png) | ![Conteos físicos](docs/images/screenshots/conteos-fisicos.png) |

## Compras y costos

| Detalle de compra | Resumen de costos de importación |
|---|---|
| ![Detalle de compra](docs/images/screenshots/compra-detalle.png) | ![Costos de importación](docs/images/screenshots/costos-importacion.png) |

## Ventas

| Listado de ventas | Detalle de venta |
|---|---|
| ![Listado de ventas](docs/images/screenshots/ventas-listado.png) | ![Detalle de venta](docs/images/screenshots/venta-detalle.png) |

## Clientes y servicio técnico

![Detalle de cliente](docs/images/screenshots/cliente-detalle.png)

| Bandeja de servicios | Detalle de servicio |
|---|---|
| ![Bandeja de servicios](docs/images/screenshots/servicios-bandeja.png) | ![Detalle de servicio](docs/images/screenshots/servicio-detalle.png) |

## Caja

| Nuevo cierre (desglose por método de pago) | Detalle de cierre |
|---|---|
| ![Nuevo cierre de caja](docs/images/screenshots/cierre-caja-nuevo.png) | ![Detalle de cierre de caja](docs/images/screenshots/cierre-caja-detalle.png) |

## Reportes y documentos

| Galería de reportes | Reporte abierto |
|---|---|
| ![Galería de reportes](docs/images/screenshots/reportes-galeria.png) | ![Reporte abierto](docs/images/screenshots/reporte-ejemplo.png) |

| Factura interna | Proforma | Etiqueta con código de barras |
|---|---|---|
| ![Factura interna](docs/images/screenshots/factura-pdf.png) | ![Proforma](docs/images/screenshots/proforma-pdf.png) | ![Etiqueta de producto](docs/images/screenshots/etiqueta-pdf.png) |

## Administración

| Usuarios | Estado del sistema |
|---|---|
| ![Usuarios](docs/images/screenshots/usuarios-listado.png) | ![Estado del sistema](docs/images/screenshots/estado-sistema.png) |

## App de escritorio (Windows)

![App de escritorio en Windows](docs/images/screenshots/app-escritorio-windows.png)

---

# Resumen funcional implementado

## Infraestructura

- Arquitectura basada en Docker Compose.
- Base de datos PostgreSQL 17.
- Backend desarrollado con Django y Django REST Framework.
- Backend productivo ejecutado mediante Gunicorn.
- Frontend desarrollado con Next.js.
- Frontend productivo preparado en modo standalone.
- Proxy inverso mediante Nginx.
- Configuración separada para desarrollo y producción.
- Instalación offline mediante paquetes versionados.
- Verificación de integridad mediante SHA-256.
- Healthchecks para los servicios principales.
- Scripts de instalación, inicio, parada, reinicio, estado, respaldo, restauración, actualización y rollback.
- Generación automatizada de secretos durante la instalación inicial.
- Backups verificables.
- Backups automáticos mediante systemd timer.
- Política básica de retención local.
- Restauración de prueba.
- Restauración productiva controlada.
- Actualización offline automatizada.
- Rollback productivo validado.
- Generación de paquetes offline.
- Imágenes Docker orientadas a `linux/amd64`.
- Arranque automático preparado mediante systemd.
- Modo kiosco preparado para estaciones gráficas Linux (`infra/systemd/lics-kiosk.service`), documentado pero ya no es el plan de producción vigente.
- App de escritorio nativa para Windows (Electron + WSL2 + Docker Engine): instalador `.exe`, imagen dorada, arranque y actualización automáticos — ver [Despliegue en Windows](infra/windows/README.md).

## Backend operativo

- Login, logout y usuario actual.
- Administración básica de usuarios.
- Roles base del sistema.
- Permisos por módulo.
- Usuario de solo lectura.
- Endpoint administrativo de estado.
- Ubicaciones físicas.
- Productos, con variantes (original/genérico/otro) que comparten un mismo código estándar y ubicación pero tienen precio y stock propios (§3.6) — reemplaza el antiguo modelo de "referencias" puramente descriptivas.
- Precio de venta editable por producto, con sugerencia calculada desde el último costo de compra.
- Proveedores.
- Referencias proveedor-producto.
- Compras.
- Confirmación y anulación de compras.
- Costos de importación.
- Resumen de costos por compra.
- Historial de costos append-only.
- Ventas, con método de pago (efectivo/tarjeta/transferencia/otro).
- Confirmación y anulación de ventas.
- Validación de stock suficiente.
- Clientes.
- Inyectores.
- Servicios de inyector: precio (sugerido desde tipo de servicio + accesorios reales usados, editable), método de pago, catálogo de "Tipo de Servicio" con histórico de precio.
- Accesorios de servicio ligados al inventario real de productos, con descuento y reversión de stock.
- Cierre de caja semanal (sábado a viernes), suma ventas y servicios por método de pago (efectivo/tarjeta/transferencia/otro), con desglose por método y total congelados al cerrar, permisos solo ADMIN por ahora.
- Documentos PDF: etiquetas, proforma y facturas internas (no fiscales) para ventas confirmadas y servicios entregados.
- Conteo físico.
- Ajustes auditables de inventario.
- Búsqueda universal.
- Reportes JSON.
- Etiquetas PDF con código de barras Code128 real.

## Frontend operativo

- Autenticación con inicio y cierre de sesión.
- Panel de inicio accionable: servicios listos para entregar, productos bajo mínimo, borradores de venta y de compra pendientes, alerta de cierre de caja pendiente de la semana, y "vistos recientemente" con los últimos elementos abiertos en todo el sistema (productos, ubicaciones, proveedores, compras, ventas, clientes, inyectores, servicios y cierres de caja).
- Pantalla administrativa de estado del sistema.
- Búsqueda universal con atajo de teclado y navegación a detalle, cubriendo productos (nombre/descripción/código), ubicaciones, proveedores, clientes (nombre/identificación/teléfono), ventas y servicios de inyector.
- Módulo de productos: listado, detalle, creación, edición, precio de venta editable con sugerencia, variantes original/genérico bajo el mismo código (creación guiada, sin afectar el formulario normal de creación), historial de movimientos e impresión de etiquetas.
- Módulo de ubicaciones: listado, detalle, creación y edición.
- Módulo de proveedores: listado, detalle, creación, edición y gestión de productos asociados.
- Módulo de compras: listado con filtros, detalle, creación, edición de borrador, líneas de compra, confirmación y anulación con motivo.
- Módulo de costos de importación: categorías, costos por compra con conversión de moneda mediante tipo de cambio, resumen de costos con desglose por producto, aplicación de costos e histórico append-only.
- Módulo de ventas: listado con filtros, detalle, creación, edición de borrador, líneas de venta con referencia de precio sugerido y validación de stock disponible, confirmación y anulación con motivo, método de pago, descarga de factura interna para ventas confirmadas.
- Módulo de clientes: listado con filtros (búsqueda, tipo, activo/inactivo), detalle con inyectores y ventas relacionadas, creación y edición.
- Módulo de inyectores y servicios: inyectores (listado, detalle, creación, edición), y bandeja operativa de servicios (recepción, iniciar, marcar listo, entregar, anular — la entrega exige que el servicio tenga precio definido) con datos técnicos editables, precio con sugerencia (tipo de servicio + accesorios usados) y método de pago, gestión de accesorios reales de inventario, tarjeta resumen de precio total, y descarga de factura interna para servicios entregados.
- Módulo de cierre de caja: listado, detalle, creación con previsualización del desglose esperado por método de pago (efectivo/tarjeta/transferencia/otro) y el total antes de confirmar, un único campo de "total contado" (así se concilia igual que en el proceso real: efectivo + vouchers de datáfono + comprobantes de transferencia contra lo registrado), semana sábado-viernes, solo visible para ADMIN por ahora.
- Proforma: generación desde el listado de productos, cliente opcional.
- Módulo de conteos físicos: listado con filtros (búsqueda, estado, rango de fechas, activo/inactivo), creación, captura rápida de líneas (búsqueda de producto, cantidad, avance con Enter, prevención de duplicados), diferencia visible contra el stock actual del sistema, edición y eliminación de líneas en borrador, aprobación y anulación.
- Navegación por roles y permisos.
- Módulo de movimientos de inventario: listado general paginado con filtros (producto, ubicación, tipo, dirección, rango de fechas), modo kardex automático con saldo corriente al filtrar por un solo producto, y enlace desde cada movimiento a su origen (compra, venta o conteo físico).
- Módulo de reportes: 8 reportes operativos (bajo mínimo, stock por ubicación, movimientos, compras por proveedor, comparación de precios por proveedor, ventas por fecha, productos más vendidos, clientes con más ventas), accesibles desde una galería en `/reports` y una única entrada "Reportes" en el menú lateral.

---

# Arquitectura general

    Usuario
      |
      v
    App de escritorio (Electron) o navegador
      |
      v
    http://localhost
      |
      v
    Nginx
      |
      +--> Next.js
      |
      +--> Django REST Framework
              |
              v
          PostgreSQL

Todos los componentes se ejecutan como servicios independientes mediante Docker Compose.

En producción sobre Windows, todo este stack corre dentro de una distro WSL2 (Ubuntu 24.04 + Docker Engine); la app de escritorio Electron lo arranca, lo verifica y muestra la interfaz en una ventana nativa — sin modo kiosco, porque la misma computadora también se usa para otras tareas. El modo kiosco con Chromium sobre Linux (Ubuntu Desktop / Linux Mint) se mantiene documentado como alternativa, pero ya no es el plan de producción vigente.

En producción, solamente Nginx publica un puerto hacia el equipo anfitrión. PostgreSQL, backend y frontend permanecen dentro de la red interna de Docker.

Documentación relacionada:

- [Arquitectura del sistema](docs/architecture.md)
- [Estructura de instalación en producción](docs/production-layout.md)
- [Despliegue en Windows (app de escritorio)](infra/windows/README.md)
- [Despliegue (histórico, plan Linux/kiosco)](docs/deployment.md)

---

# Tecnologías principales

| Área | Tecnología |
|---|---|
| Plataforma de producción | Windows 10/11 con WSL2 (Ubuntu 24.04) |
| App de escritorio | Electron + electron-builder (instalador NSIS) |
| Contenedores | Docker Engine (dentro de WSL2) + Docker Compose |
| Backend | Python, Django, Django REST Framework |
| Servidor backend | Gunicorn |
| Frontend | Next.js, React, TypeScript |
| Base de datos | PostgreSQL 17 |
| Proxy local | Nginx |
| Documentos PDF | ReportLab |
| Interfaz final | Ventana nativa de Electron (Chromium en modo kiosco, documentado como alternativa Linux) |
| Soporte técnico | `docs/troubleshooting.md` + `infra/windows/README.md` (vía WSL, sin SSH) |
| Versionado | Git y GitHub |
| Distribución | Instalador `.exe` (imagen dorada embebida), por USB o red |

---

# Arquitectura del repositorio

    backend/
        Código fuente del backend Django.

    frontend/
        Aplicación web desarrollada con Next.js.

    infra/
        Configuración de Docker, Nginx y componentes de infraestructura.

    scripts/
        Automatización de instalación, operación, respaldo, restauración, actualización y soporte.

    docs/
        Documentación técnica y operativa del proyecto.

    VERSION
        Versión actual del proyecto.

    CHANGELOG.md
        Historial de cambios.

---

# Entornos

## Desarrollo

El entorno de desarrollo está diseñado para ejecutarse desde una estación de trabajo compatible con Docker.

Requisitos:

- Docker Engine o Docker Desktop.
- Docker Compose.
- Git.
- Make.

Configuración inicial:

    cp infra/docker/.env.example infra/docker/.env

Inicio:

    make up

Administración:

    make ps
    make logs
    make restart
    make check
    make migrate
    make makemigrations
    make shell
    make test

## Producción

El entorno de producción vigente es la app de escritorio nativa para Windows 10/11: un instalador
`.exe` que prepara una distro WSL2 (Ubuntu 24.04) con Docker Engine y una app Electron que arranca,
verifica y muestra la interfaz. Las imágenes Docker que corren dentro de esa distro siguen orientadas a
`linux/amd64` — ver [Despliegue en Windows](infra/windows/README.md) y
[Cierre de etapa: app de escritorio Windows](docs/windows-desktop-stage-closure.md).

El proceso productivo utiliza:

- imágenes Docker versionadas (`linux/amd64`), embebidas en el instalador como imagen dorada;
- instalación automatizada mediante el instalador `.exe`;
- generación automática de secretos;
- configuración independiente de desarrollo;
- validaciones previas de instalación;
- comprobaciones automáticas de salud;
- respaldos automáticos (systemd timer dentro de WSL2, con arranque programado vía tarea de Windows);
- restauración controlada;
- actualización offline (expuesta como botón "Actualizar aplicación" en el menú de la app);
- rollback (procedimiento manual por WSL, no expuesto como botón).

La instalación productiva no depende del repositorio Git ni de acceso a Internet para operar.

El plan original de despliegue directo sobre un equipo Linux x86_64 dedicado (Ubuntu Desktop/Linux Mint
en modo kiosco) se mantiene documentado como registro histórico en
[Despliegue (histórico)](docs/deployment.md), pero ya no es el plan de producción vigente.

---

# Endpoints principales

## Sistema

    GET /api/health/
    GET /api/system/status/

`/api/health/` es el healthcheck técnico utilizado por la infraestructura.

`/api/system/status/` es un endpoint administrativo. Requiere un usuario
superusuario, `is_staff` o miembro del grupo `ADMIN`. Los usuarios
autenticados sin privilegios administrativos reciben `403 Forbidden`.

## Cuentas

    POST /api/accounts/login/
    POST /api/accounts/logout/
    GET /api/accounts/me/
    GET /api/accounts/users/
    POST /api/accounts/users/
    GET /api/accounts/users/{id}/
    PATCH /api/accounts/users/{id}/

## Inventario y compras

    GET /api/inventory/locations/
    GET /api/inventory/products/
    GET /api/inventory/products/?standard_code=<codigo>
    POST /api/inventory/products/{id}/add-variant/
    GET /api/inventory/suppliers/
    GET /api/inventory/supplier-products/
    GET /api/inventory/purchases/
    POST /api/inventory/purchases/{id}/confirm/
    POST /api/inventory/purchases/{id}/cancel/
    POST /api/inventory/purchases/{id}/calculate-costs/
    GET /api/inventory/purchases/{id}/cost-summary/
    GET /api/inventory/purchase-items/
    GET /api/inventory/import-cost-categories/
    GET /api/inventory/import-costs/
    GET /api/inventory/product-cost-history/
    GET /api/inventory/stock-movements/
    GET /api/inventory/inventory-counts/
    POST /api/inventory/inventory-counts/{id}/approve/
    POST /api/inventory/inventory-counts/{id}/cancel/

## Ventas

    GET /api/sales/sales/
    POST /api/sales/sales/
    POST /api/sales/sales/{id}/confirm/
    POST /api/sales/sales/{id}/cancel/
    GET /api/sales/sale-items/
    POST /api/sales/sale-items/

## Clientes e inyectores

    GET /api/customers/customers/
    GET /api/customers/injectors/
    GET /api/customers/service-records/
    POST /api/customers/service-records/{id}/start/
    POST /api/customers/service-records/{id}/mark-ready/
    POST /api/customers/service-records/{id}/deliver/
    POST /api/customers/service-records/{id}/cancel/
    GET /api/customers/accessories/
    GET /api/customers/service-accessories/
    GET /api/customers/service-types/

## Caja

    GET /api/cash/closings/
    POST /api/cash/closings/
    GET /api/cash/closings/preview/?week_start=YYYY-MM-DD

## Búsqueda, reportes y documentos

    GET /api/search/?q=texto
    GET /api/reports/low-stock-products/
    GET /api/reports/stock-by-location/
    GET /api/reports/product-movements/?product=<id>
    GET /api/reports/product-supplier-prices/?product=<id>
    GET /api/reports/purchases-by-supplier/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    GET /api/reports/sales-by-date/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    GET /api/reports/top-selling-products/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    GET /api/reports/top-customers/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&ordering=total
    GET /api/documents/product-labels/?product=<id>&product=<id>
    POST /api/documents/proforma/
    GET /api/documents/sales/{id}/invoice/
    GET /api/documents/services/{id}/invoice/

---

# Documentación

Índice general:

- [Índice de documentación](docs/index.md)

Documentos de estado:

- [Cierre de backend base](docs/backend-base-closure.md)
- [Cierre de infraestructura productiva base](docs/infrastructure-stage-closure.md)
- [Cierre de etapa: app de escritorio Windows](docs/windows-desktop-stage-closure.md)
- [Lista de preparación para producción — Windows (vigente)](docs/windows-production-checklist.md)
- [Lista de preparación para producción (histórica, plan Linux/kiosco)](docs/production-readiness-checklist.md)
- [Roadmap](docs/roadmap.md)

Documentos técnicos:

- [Arquitectura del sistema](docs/architecture.md)
- [Modelo de datos](docs/data-model.md)
- [Dominio de inventario](docs/domain/inventory.md)
- [Estructura de instalación en producción](docs/production-layout.md)

Documentos de frontend:

- [Auditoría previa al frontend](docs/frontend-audit.md)
- [Roadmap de frontend](docs/frontend-roadmap.md)
- [Sistema de diseño del frontend](docs/frontend-design-system.md)

Documentos operativos:

- [Desarrollo](docs/development.md)
- [Despliegue en Windows (vigente)](infra/windows/README.md)
- [Despliegue (histórico, plan Linux/kiosco)](docs/deployment.md)
- [Backups y restauración](docs/backup-restore.md)
- [Proceso de actualización](docs/update-process.md)
- [Seguridad](docs/security.md)
- [Solución de problemas](docs/troubleshooting.md)

Insumos y trabajo en curso (no son documentación de referencia del sistema tal como está hoy):

- [Backlog de la visita al cliente (2026-09, 20 puntos)](docs/backlog-cliente-2026-09.md) — ya implementado.

---

# Estado de validación

Validación técnica del backend base:

    Django check: OK
    Migraciones pendientes: no
    Tests backend: suite completa en verde (último recuento parcial confirmado: 323 en
    apps.inventory + apps.core, 2026-09-09 — correr `make test` para el número exacto de la
    suite completa antes de citar un total).
    Build backend Docker: OK

El backend base queda cerrado como `0.2.0-alpha`. Las fases posteriores (frontend operativo,
backlog de la visita al cliente 2026-09) están descritas en [Roadmap](docs/roadmap.md).

---

# Pendientes principales

El frontend operativo y el backlog de la visita al cliente (2026-09) ya están completos — ver
[Roadmap](docs/roadmap.md). Lo que queda antes de operar con datos reales del negocio:

1. Validación con usuarios y datos reales (Fase 8 del roadmap): revisión de flujos, campos,
   reportes, documentos y permisos reales, con el negocio operando de verdad.
2. Migración DBF legacy con archivos reales del cliente (Fase 10) — no puede avanzar sin esos
   archivos.
3. Dos riesgos de la app de escritorio Windows sin validar con uso real extendido: el
   endurecimiento de las tareas programadas ocultas (§10.3 de
   [windows-desktop-stage-closure.md](docs/windows-desktop-stage-closure.md)) y el flujo
   "Actualizar aplicación" nunca probado contra hardware real — ver
   [checklist vigente](docs/windows-production-checklist.md).
4. Documentos PDF adicionales más allá de proforma y facturas (Fase 9): catálogo interno, reportes
   en PDF, boletas de recepción/entrega de inyector — solo si el negocio los pide de verdad.
5. Manuales de usuario y técnico, capacitación y plan de soporte formal (Fase 12).
