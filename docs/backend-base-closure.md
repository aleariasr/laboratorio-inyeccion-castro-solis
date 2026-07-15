# Cierre de backend base

## Versión

    0.2.0-alpha

## Estado

El backend base del sistema LICS queda cerrado como una versión funcional inicial para continuar con el frontend operativo y la validación con flujos reales del negocio.

Este cierre no significa que el backend sea definitivo. Significa que existe una base estable, probada y suficientemente completa para construir pantallas reales, validar procesos con usuarios y detectar ajustes necesarios antes de seguir ampliando funcionalidades.

## Validación técnica

Validaciones ejecutadas antes del cierre:

    git status: limpio
    Django check: sin issues
    makemigrations --check --dry-run: sin migraciones pendientes
    tests backend: 269 tests OK
    build backend Docker: OK

## Alcance implementado

### Infraestructura backend

- Django con Django REST Framework.
- PostgreSQL como base de datos.
- Docker Compose para desarrollo.
- Dockerfile productivo con Gunicorn.
- Configuración separada de desarrollo y producción.
- Healthcheck backend.
- Autenticación con token.
- Tests automatizados por módulo.

### Usuarios y permisos

- Login.
- Logout.
- Usuario actual.
- Administración básica de usuarios.
- Roles base del sistema.
- Creación automática e idempotente de roles en instalación y actualización.
- Permisos por módulo.
- Usuario de solo lectura.

Roles base:

- `ADMIN`.
- `INVENTORY`.
- `SALES`.
- `CUSTOMERS`.
- `READ_ONLY`.

### Estado del sistema

Endpoint implementado:

    GET /api/system/status/

Incluye:

- estado general;
- versión;
- hora del servidor;
- entorno;
- usuario autenticado;
- grupos del usuario;
- módulos disponibles.

### Inventario

Implementado:

- ubicaciones físicas;
- productos;
- referencias o códigos alternos;
- movimientos de inventario;
- entradas;
- salidas;
- ajustes positivos;
- ajustes negativos controlados;
- validación para evitar stock negativo;
- cálculo de stock desde movimientos;
- conteo físico;
- aprobación de conteo físico;
- ajustes automáticos por diferencia de conteo.
- protección contra edición y eliminación de conteos aprobados o anulados;
- protección de las líneas pertenecientes a conteos finalizados.

Regla principal:

El stock no se edita directamente. La fuente de verdad son los movimientos de inventario.

### Proveedores y compras

Implementado:

- proveedores;
- relación proveedor-producto;
- compras;
- líneas de compra;
- confirmación de compra;
- anulación de compra;
- generación de entradas de inventario al confirmar compras;
- reversión trazable del inventario al anular compras confirmadas;
- motivo obligatorio de anulación;
- protección contra eliminación de compras y líneas finalizadas;
- auditoría de confirmación y anulación.

Auditoría de compras:

- `confirmed_at`;
- `confirmed_by`;
- `cancelled_at`;
- `cancelled_by`.

### Costos

Implementado:

- categorías de costos de importación;
- costos de importación asociados a compras;
- resumen calculado de costos por compra;
- cálculo de factor de costo;
- margen aplicado;
- precio sugerido;
- historial de costos por producto;
- historial append-only, sin sobrescribir cálculos previos.

Endpoints relevantes:

    POST /api/inventory/purchases/{id}/calculate-costs/
    GET /api/inventory/purchases/{id}/cost-summary/?margin_percentage=30.0000

### Ventas

Implementado:

- ventas;
- líneas de venta;
- confirmación de venta;
- anulación de venta;
- validación de stock suficiente;
- generación de salidas de inventario al confirmar ventas;
- reversa de stock al anular ventas confirmadas;
- movimientos de reversión vinculados con los movimientos originales;
- motivo obligatorio de anulación;
- protección contra eliminación de ventas y líneas finalizadas;
- auditoría de confirmación y anulación.

Auditoría de ventas:

- `confirmed_at`;
- `confirmed_by`;
- `cancelled_at`;
- `cancelled_by`.

### Clientes e inyectores

Implementado:

- clientes;
- inyectores;
- registros de servicio de inyector;
- accesorios normalizados;
- relación entre servicio y accesorios;
- estados básicos del flujo de servicio.

### Búsqueda universal

Endpoint implementado:

    GET /api/search/?q=texto

Busca en:

- productos;
- ubicaciones;
- referencias de producto;
- proveedores;
- compras/facturas;
- clientes;
- inyectores.

### Reportes JSON

Endpoints implementados:

    GET /api/reports/low-stock-products/
    GET /api/reports/stock-by-location/
    GET /api/reports/product-movements/?product=<id>
    GET /api/reports/purchases-by-supplier/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    GET /api/reports/sales-by-date/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    GET /api/reports/top-selling-products/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD

Los reportes están organizados técnicamente en vistas separadas para búsqueda y reportes.

### Documentos PDF

Implementado módulo inicial de documentos:

    apps.documents

Dependencia agregada:

    reportlab

Endpoint implementado:

    GET /api/documents/product-labels/?product=<id>&product=<id>

Genera PDF de etiquetas con:

- código de ubicación;
- código de barras real Code128 basado en la ubicación;
- código estándar del producto;
- nombre;
- descripción corta.

## Endpoints principales

### Cuentas

    POST /api/accounts/login/
    POST /api/accounts/logout/
    GET /api/accounts/me/
    GET /api/accounts/users/
    POST /api/accounts/users/
    GET /api/accounts/users/{id}/
    PATCH /api/accounts/users/{id}/

### Inventario

    GET /api/inventory/locations/
    GET /api/inventory/products/
    GET /api/inventory/product-references/
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
    GET /api/inventory/inventory-counts/
    POST /api/inventory/inventory-counts/{id}/approve/

### Ventas

    GET /api/sales/sales/
    POST /api/sales/sales/
    POST /api/sales/sales/{id}/confirm/
    POST /api/sales/sales/{id}/cancel/
    GET /api/sales/sale-items/
    POST /api/sales/sale-items/

### Clientes

    GET /api/customers/customers/
    GET /api/customers/injectors/
    GET /api/customers/service-records/
    POST /api/customers/service-records/{id}/start/
    POST /api/customers/service-records/{id}/mark-ready/
    POST /api/customers/service-records/{id}/deliver/
    POST /api/customers/service-records/{id}/cancel/
    GET /api/customers/accessories/
    GET /api/customers/service-accessories/

### Sistema, búsqueda, reportes y documentos

    GET /api/system/status/
    GET /api/search/
    GET /api/reports/low-stock-products/
    GET /api/reports/stock-by-location/
    GET /api/reports/product-movements/
    GET /api/reports/purchases-by-supplier/
    GET /api/reports/sales-by-date/
    GET /api/reports/top-selling-products/
    GET /api/documents/product-labels/
    GET /api/health/

## Decisiones técnicas importantes

- El backend queda como base estable, no como backend final.
- No se deben agregar nuevos módulos de negocio sin validar flujos reales.
- El frontend debe consumir esta base antes de seguir ampliando backend.
- La migración DBF queda pendiente hasta disponer de archivos reales o muestras.
- Los documentos PDF adicionales deben construirse sobre el módulo `apps.documents`.
- Los reportes deben mantenerse separados técnicamente de la búsqueda.
- El stock debe seguir calculándose desde movimientos.
- Las operaciones críticas deben seguir implementándose mediante servicios de dominio.
- Los estados críticos deben modificarse mediante acciones específicas, no mediante edición directa.

## Pendientes posteriores

### Frontend operativo

Prioridad recomendada:

1. Login.
2. Estado del sistema.
3. Búsqueda universal.
4. Productos y ubicaciones.
5. Compras.
6. Ventas.
7. Reportes.
8. Generación de etiquetas PDF.

### Backend futuro según validación real

- Catálogo interno de productos PDF.
- PDF de productos bajo mínimo.
- PDF de compras.
- PDF de ventas.
- PDF de boleta de recepción o entrega de inyector.
- Migración DBF legacy.
- Conciliación de migración.
- Caja.
- Ajustes derivados del uso real.

## Conclusión

El backend base de LICS queda cerrado en versión `0.2.0-alpha`.

La siguiente fase recomendada es construir el frontend operativo mínimo para validar el sistema con pantallas reales antes de continuar ampliando funcionalidades backend.

## Documentación relacionada

- [README principal](../README.md)
- [Índice de documentación](index.md)
- [Roadmap](roadmap.md)
- [Modelo de datos](data-model.md)
- [Dominio de inventario](domain/inventory.md)
- [Checklist de producción](production-readiness-checklist.md)
