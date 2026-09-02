# Modelo de datos LICS

Este documento define el modelo de datos base para el sistema LICS.

El sistema debe diseñarse como software de producción, usando PostgreSQL, Django y Django REST Framework. El modelo debe cumplir como mínimo con Tercera Forma Normal y, cuando sea razonable, con BCNF.

## Principios de diseño

- No duplicar información innecesariamente.
- Mantener integridad referencial mediante claves primarias y foráneas.
- Evitar columnas con listas, valores múltiples o datos mezclados.
- Usar restricciones `UNIQUE`, `NOT NULL`, `CHECK` y `FOREIGN KEY` cuando correspondan.
- No editar el stock directamente.
- Todo cambio de inventario debe quedar registrado mediante movimientos.
- Todo documento generado debe provenir de datos registrados en el sistema, no de archivos Excel externos.
- Todo registro operativo importante debe guardar trazabilidad de usuario y fecha.
- Solo se desnormaliza si existe una justificación técnica clara de rendimiento.

## Usuarios y permisos

El sistema tendrá autenticación obligatoria.

Cada persona que use el sistema debe tener su propio usuario. Aunque inicialmente todos los usuarios puedan ser administradores, no se debe operar con un usuario compartido.

La administración de usuarios debe permitir:

- crear usuarios;
- activar o desactivar usuarios;
- asignar permisos;
- cambiar roles;
- controlar acceso por módulo.

Los permisos iniciales del sistema serán:

- administración;
- inventario;
- proveedores;
- compras;
- ventas;
- clientes;
- reportes;
- documentos.

Se usará el sistema nativo de usuarios, grupos y permisos de Django siempre que sea suficiente. No se debe reinventar un sistema de autenticación propio sin necesidad.

> Nota de implementación: los permisos por módulo de la lista anterior son conceptuales. En la implementación real (`apps/core/permissions.py`) el control de acceso se hace mediante 5 roles fijos (grupos de Django): `ADMIN`, `INVENTORY`, `SALES`, `CUSTOMERS` y `READ_ONLY`. `AdministrationPermission` controla quién administra usuarios (superusuarios, staff o grupo `ADMIN`), y `ModulePermission` resuelve el permiso Django exacto (`view_<módulo>` / `add_<módulo>` / `change_<módulo>` / `cancel_<módulo>`) según el método HTTP y la acción del ViewSet. `is_staff` por sí solo ya no da acceso a los módulos de negocio, solo al panel `/admin/` de Django.

## Inventario

El inventario es el núcleo del sistema.

### StorageLocation

Representa una ubicación física en bodega.

Ejemplos:

- A124
- B123
- C50

El código de ubicación es también el código operativo usado para búsqueda, etiquetas y escaneo.

No debe existir otro campo duplicado tipo `internal_code`.

Campos conceptuales:

- código de ubicación;
- letra de estante;
- número de posición;
- descripción opcional;
- estado activo/inactivo.

Restricciones:

- el código de ubicación debe ser único;
- la combinación de letra de estante y número debe ser única;
- la letra de estante debe ser válida;
- el número debe ser positivo.

> Nota de implementación: el modelo real (`StorageLocation`) no separa letra de estante y número en columnas distintas. Tiene un único campo `code` (`CharField`, máx. 5 caracteres, único) validado con la expresión regular `^[A-Z][1-9][0-9]{0,3}$` (ej. `A124`), más `description` (opcional) y los campos de auditoría/activo estándar.

### Product

Representa una pieza o repuesto.

Campos conceptuales:

- código estándar o universal de la pieza;
- nombre;
- descripción corta;
- marca principal opcional;
- ubicación principal;
- cantidad mínima;
- estado activo/inactivo.

El producto no debe guardar un campo de stock editable directamente.

La existencia actual se obtiene desde los movimientos de inventario.

> Nota de implementación: el modelo real (`Product`) **no tiene** un campo `brand`/marca. Sus campos reales son `standard_code`, `name`, `description`, `storage_location` (FK), `minimum_stock`, `unit_of_measure` y los campos de auditoría/activo estándar. La marca se maneja a nivel de `ProductReference.manufacturer` y de `SupplierProduct.manufacturer`, no en `Product`.

### ProductAlias (implementado como `ProductReference`)

Representa códigos equivalentes, referencias de proveedor, marcas alternativas o códigos usados para una misma pieza.

Esto evita duplicar productos cuando varias marcas o proveedores venden piezas equivalentes.

Campos conceptuales:

- producto;
- código alternativo;
- marca;
- proveedor opcional;
- descripción;
- estado activo/inactivo.

Restricciones:

- no debe repetirse el mismo código alternativo para el mismo producto;
- si un código alternativo identifica de forma única una pieza en el negocio, se debe validar su unicidad según la regla operativa definida.

> Nota de implementación: el modelo implementado se llama `ProductReference`, no `ProductAlias`. Sus campos reales son `product`, `manufacturer`, `reference_code`, `description` e `is_active`, con una restricción única sobre `(product, manufacturer, reference_code)`. La relación con el proveedor no vive en este modelo: se maneja por separado mediante `SupplierProduct` (ver más abajo). Ver [Dominio de inventario](domain/inventory.md) para el detalle actualizado.

### StockMovement

Representa cualquier cambio de inventario.

Tipos iniciales:

- entrada;
- salida;
- ajuste positivo;
- ajuste negativo.

Campos conceptuales:

- producto;
- tipo de movimiento;
- cantidad;
- motivo;
- referencia a compra opcional;
- referencia a venta opcional;
- usuario responsable;
- fecha de creación.

Reglas:

- la cantidad debe ser mayor que cero;
- no se debe permitir salida si no existe stock suficiente, salvo ajustes administrativos controlados;
- ningún movimiento debe borrarse físicamente en operación normal;
- las correcciones deben hacerse con movimientos compensatorios.

## Proveedores

### Supplier

Representa un proveedor nacional o internacional.

Campos conceptuales:

- nombre;
- teléfono;
- correo;
- país;
- notas;
- estado activo/inactivo.

### SupplierProductReference (implementado como `SupplierProduct`)

Relaciona proveedores con productos o códigos equivalentes.

Permite saber qué proveedor vende una pieza y bajo cuál código la maneja.

Campos conceptuales:

- proveedor;
- producto;
- código del proveedor;
- marca;
- notas;
- estado activo/inactivo.

> Nota de implementación: el modelo implementado se llama `SupplierProduct`, no `SupplierProductReference`. Sus campos reales son `supplier`, `product`, `supplier_reference`, `manufacturer`, `preferred_supplier`, `notes` e `is_active`, con una restricción única sobre `(supplier, product, supplier_reference)`. Ver [Dominio de inventario](domain/inventory.md) para el detalle actualizado.

## Compras

### Purchase

Representa una compra o importación.

Campos conceptuales:

- proveedor;
- número de factura;
- fecha;
- moneda;
- tipo de cambio;
- notas;
- estado.

Estados iniciales:

- borrador;
- confirmada;
- anulada.

Una compra confirmada genera movimientos de entrada en inventario.

### PurchaseItem

Representa cada línea de producto comprada.

Campos conceptuales:

- compra;
- producto;
- cantidad;
- precio unitario;
- moneda;
- subtotal.

Restricciones:

- la cantidad debe ser mayor que cero;
- el precio unitario no debe ser negativo.

> Nota de implementación: el modelo real (`PurchaseItem`) referencia `supplier_product` (FK a `SupplierProduct`), no `product` directamente. Sus campos reales son `purchase`, `supplier_product`, `quantity` y `unit_cost`, con restricción única sobre `(purchase, supplier_product)`. No existe un campo `currency` en esta línea: la moneda se define a nivel de la compra (`Purchase.currency`). El `subtotal` tampoco es un campo almacenado: se calcula en el serializador (`SerializerMethodField`) como `quantity * unit_cost`.

## Costos de importación y cálculo de costo

El sistema debe integrar la lógica que actualmente se maneja en Excel.

### ImportCostCategory

Representa una categoría de costo asociada a compras o importaciones.

Ejemplos:

- impuestos;
- fletes;
- seguros;
- trámites;
- otros cargos.

### ImportCost

Representa un costo específico asociado a una compra.

Campos conceptuales:

- compra;
- categoría;
- descripción;
- monto;
- moneda;
- tipo de cambio.

> Nota de implementación: el modelo real (`ImportCost`) incluye un campo `exchange_rate` (tipo de cambio) usado para convertir este costo a la moneda de la compra; no basta con `currency` solamente.

### PurchaseCostSummary

> Nota de implementación: `PurchaseCostSummary` **no es un modelo de base de datos**. No existe una tabla `PurchaseCostSummary` en `apps/inventory/models/`. Lo que existe es `PurchaseCostSummaryInputSerializer` (un `serializers.Serializer` plano, no `ModelSerializer`) que valida la entrada del endpoint `POST /api/inventory/purchases/{id}/calculate-costs/` y `GET /api/inventory/purchases/{id}/cost-summary/`; el resumen se calcula bajo demanda y se persiste indirectamente mediante `ProductCostHistory`, no en una tabla propia de resumen.

Representa el resumen calculado de costos de una compra.

Campos conceptuales:

- compra;
- subtotal de factura;
- total de costos adicionales;
- costo total;
- factor de costo;
- margen aplicado;
- fecha de cálculo.

Regla conceptual:

factor de costo = costo total / subtotal de factura

Cuando el subtotal de factura sea cero, no se debe calcular el factor.

### ProductCostHistory

Guarda el histórico de costo calculado por producto.

Campos conceptuales:

- producto;
- compra;
- costo unitario original;
- factor aplicado;
- costo unitario final;
- moneda;
- tipo de cambio;
- margen aplicado;
- precio sugerido;
- fecha de cálculo.

Los precios históricos no deben sobrescribirse. Si cambia una compra o se recalcula un costo, debe quedar trazabilidad.

## Ventas

### Sale

Representa una venta.

Campos conceptuales:

- cliente opcional;
- fecha;
- moneda;
- tipo de cambio;
- notas;
- estado.

Estados iniciales:

- borrador;
- confirmada;
- anulada.

Una venta confirmada genera movimientos de salida en inventario.

### SaleItem

Representa cada línea de producto vendida.

Campos conceptuales:

- venta;
- producto;
- cantidad;
- precio unitario;
- subtotal.

Restricciones:

- la cantidad debe ser mayor que cero;
- no se debe permitir vender más unidades que el stock disponible.

## Clientes e inyectores

### Customer

Representa un cliente.

Campos conceptuales:

- nombre;
- tipo de cliente;
- teléfono;
- correo opcional;
- identificación opcional;
- notas;
- estado activo/inactivo.

> Nota de implementación: el modelo real (`Customer`) sí tiene un campo `customer_type` (`CustomerType.PERSON` / `CustomerType.COMPANY`, por defecto `PERSON`), además de `display_name`, `phone`, `email`, `identification`, `notes` y los campos de auditoría/activo estándar.

### InjectorServiceRecord

Representa un registro de trabajo asociado a un inyector recibido de un cliente.

Campos conceptuales:

- cliente;
- número de inyector;
- resistencia;
- fuga;
- notas de antes;
- notas de después;
- observaciones;
- fecha de recepción;
- fecha de entrega opcional;
- usuario responsable.

> Nota de implementación: el modelo real (`InjectorServiceRecord`) **no** tiene campos directos `cliente` ni `número de inyector`. Referencia un `injector` (FK a `Injector`), y es `Injector` quien tiene `customer` (FK a `Customer`) e `injector_number`. Es decir, cliente y número de inyector se obtienen indirectamente vía `injector.customer` e `injector.injector_number`. El campo `status` (`RECEIVED` / `IN_PROGRESS` / `READY` / `DELIVERED` / `CANCELLED`) tampoco aparece en la lista conceptual anterior y es central para el flujo de servicio (acciones `start`, `mark-ready`, `deliver`, `cancel`).

### InjectorAccessory

Catálogo normalizado de accesorios posibles.

Ejemplos:

- filtro;
- arriba;
- abajo;
- espaciador;
- copas;
- sentadero;
- empaque;
- plato.

### InjectorServiceAccessory

Relaciona accesorios con un registro de inyector.

Campos conceptuales:

- registro de inyector;
- accesorio;
- cantidad;
- notas.

Esta relación evita columnas repetidas y mantiene el modelo normalizado.

## Documentos PDF

El sistema debe generar documentos desde los datos registrados.

Documentos iniciales:

- catálogo interno de productos;
- etiquetas de ubicación;
- hoja de etiquetas seleccionadas;
- reporte de productos bajo mínimo;
- reportes de compras;
- reportes de ventas;
- comparación de precios por proveedor.

### Etiquetas

Las etiquetas deben mantener un formato similar al Excel actual.

Contenido mínimo:

- código de ubicación;
- código estándar o código principal de pieza;
- descripción corta;
- código de barras basado en el código de ubicación.

Ejemplo conceptual:

A124  
Código de barras: A124  
1-423-124-108  
tornillo bloqueo cummins

El sistema debe permitir seleccionar varias etiquetas y generarlas en una misma hoja PDF.

## Reportes

Reportes iniciales:

- productos bajo mínimo;
- productos más vendidos por rango de fechas;
- historial de movimientos por producto;
- comparación de precios por proveedor;
- compras por proveedor;
- ventas por rango de fechas;
- stock por ubicación;
- top clientes.

Los reportes deben calcularse desde datos normalizados, no desde tablas duplicadas.

> Nota de implementación: los 8 reportes anteriores están implementados como `APIView` en `apps/core/views/reports.py` (expuestos bajo `/api/reports/...`, aunque el código vive en la app `core`, no en una app `reports` separada): `LowStockProductsReportView`, `TopSellingProductsReportView`, `ProductMovementsReportView`, `ProductSupplierPricesReportView`, `PurchasesBySupplierReportView`, `SalesByDateReportView`, `StockByLocationReportView` y `TopCustomersReportView`. El reporte de "productos sin movimiento" mencionado en versiones anteriores de este documento no existe en el código actual; se retiró de la lista hasta que se implemente.

## Búsqueda universal

El sistema debe permitir buscar información operativa desde una búsqueda general.

La búsqueda debe contemplar, como mínimo:

- código de ubicación;
- código estándar de producto;
- códigos equivalentes;
- nombre de producto;
- descripción;
- marca;
- proveedor;
- número de factura;
- cliente.

Esta búsqueda reemplaza varias consultas separadas del sistema legacy y permite localizar rápidamente piezas, compras, salidas, proveedores y registros relacionados.

## Auditoría y trazabilidad

Todo registro operativo importante debe guardar trazabilidad básica.

Campos conceptuales comunes:

- fecha de creación;
- usuario creador;
- fecha de modificación;
- usuario modificador;
- estado activo/inactivo cuando aplique.

Las operaciones críticas deben guardar trazabilidad específica:

- usuario que confirma una compra;
- fecha de confirmación de compra;
- usuario que confirma una venta;
- fecha de confirmación de venta;
- usuario que realiza un ajuste de inventario;
- motivo del ajuste;
- referencia documental cuando aplique.

No se deben borrar físicamente registros operativos importantes en operación normal.

Cuando una operación deba corregirse, se debe registrar una operación compensatoria o cambiar el estado del documento, conservando historial.

## Conteo físico y ajustes de inventario

El sistema debe soportar ajustes de inventario controlados.

Casos iniciales:

- ajuste positivo;
- ajuste negativo;
- conteo físico;
- corrección administrativa.

Un conteo físico no debe sobrescribir el stock sin dejar rastro.

Si el stock calculado del sistema es diferente al conteo físico, el sistema debe generar o registrar un movimiento de ajuste con:

- producto;
- stock esperado;
- stock contado;
- diferencia;
- usuario responsable;
- fecha;
- motivo.

Esto permite mantener el inventario real sin perder trazabilidad.

## Migración legacy DBF

La información del sistema antiguo debe migrarse con un proceso controlado.

La migración no debe hacerse insertando datos directamente al modelo final sin validación.

Flujo requerido:

1. Extraer datos desde archivos DBF.
2. Cargar datos en tablas o estructuras de staging.
3. Validar codificación, tipos de datos, fechas, montos y relaciones.
4. Detectar inconsistencias.
5. Normalizar datos hacia el modelo nuevo.
6. Importar proveedores, productos, compras, ventas y movimientos.
7. Conciliar stock final.
8. Generar reporte de migración.

Fuentes legacy identificadas:

- `INVEN01`: proveedores;
- `INVEN03`: piezas/productos;
- `INVEN05`: compras/facturas;
- `INVEN06`: salidas/ventas;
- `INVEN08`: stock auxiliar.

La migración debe registrar trazabilidad técnica separada del modelo principal.

Entidades técnicas conceptuales:

### MigrationRun

Representa una ejecución de migración.

Campos conceptuales:

- fecha de inicio;
- fecha de finalización;
- estado;
- usuario o proceso responsable;
- resumen;
- errores bloqueantes;
- advertencias.

### LegacyRecordMap

Relaciona registros legacy con registros creados en el modelo nuevo.

Campos conceptuales:

- ejecución de migración;
- tabla origen;
- clave origen;
- modelo destino;
- identificador destino;
- fecha de migración.

Esta tabla evita contaminar el modelo principal con campos legacy, pero permite auditar, repetir y reconciliar la migración.

### MigrationIssue

Registra inconsistencias encontradas durante la migración.

Ejemplos:

- producto referenciado en compra o venta que no existe en catálogo;
- proveedor faltante;
- stock diferente entre fuentes;
- fecha inválida;
- monto inválido;
- código duplicado;
- dato ilegible por codificación;
- relación incompleta.

La migración solo debe aprobarse cuando los errores bloqueantes estén resueltos o documentados formalmente.

## Validación contra sistema legacy

Antes de declarar la migración como correcta, se debe generar un reporte de conciliación.

El reporte debe incluir:

- total de proveedores detectados e importados;
- total de productos detectados e importados;
- total de compras detectadas e importadas;
- total de salidas detectadas e importadas;
- productos huérfanos;
- proveedores huérfanos;
- diferencias de stock;
- movimientos reconstruidos;
- errores bloqueantes;
- advertencias no bloqueantes.

La migración se considera aceptable solo si las diferencias están explicadas y documentadas.

## Decisiones importantes

- El código de ubicación es el código operativo escaneable.
- No se usará un campo adicional `internal_code` si duplica la ubicación.
- El stock no se guarda como valor editable simple.
- Los movimientos de inventario son la fuente de verdad para existencias.
- Los precios históricos no se sobrescriben.
- Las compras y ventas confirmadas generan movimientos de inventario.
- Los accesorios de inyectores se modelan mediante relación muchos a muchos con tabla intermedia.
- La generación de PDF se implementa como módulo separado.
- Excel se usa como referencia de proceso, no como dependencia operativa.
- La búsqueda universal será parte central del sistema para reemplazar consultas separadas del sistema legacy.
- La migración DBF se hará mediante staging, validación, normalización, importación y conciliación.
- Los códigos legacy no se agregarán directamente a las tablas principales.
- La trazabilidad legacy se manejará mediante tablas técnicas separadas.
- Los ajustes de inventario se harán mediante movimientos auditables, no sobrescribiendo stock.