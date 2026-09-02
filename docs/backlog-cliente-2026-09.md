# Backlog de la visita a la empresa (2026-09) — 20 puntos, para la próxima versión

> **Estado: pendiente de implementar.** Este documento es el resultado de una sesión de
> aclaración de 20 notas tomadas en una visita al cliente. Cada punto fue primero
> reformulado por Claude y confirmado/corregido por el dueño del proyecto, y luego
> **verificado contra el código real** del repositorio (commit `21e6ae9`, 2026-09-02) antes
> de proponer un diseño. Nada de lo marcado como "Propuesto" está implementado todavía.
> Este documento es el punto de partida para implementar en un chat nuevo — no se debe
> asumir nada más allá de lo que dice aquí sin volver a revisar el código, porque el
> código pudo haber cambiado desde esta fecha.
>
> Convenciones usadas abajo:
> - **Verificado en el código**: se leyó el archivo/modelo/vista real y esto es un hecho confirmado, con referencia de archivo.
> - **Propuesto**: diseño nuevo, no existe hoy. Es una propuesta razonada, no una decisión tomada — hay que confirmarla antes de implementar.
> - **Riesgo / decisión pendiente**: algo que el equipo debe decidir explícitamente antes o durante la implementación.

## Mapa de las 20 notas originales

| # nota original | Tema | Sección de este documento |
|---|---|---|
| 1 | Referencia duplicada (producto vs. proveedor) | [§3.1](#31-referencia-duplicada-en-supplierproduct) y [§3.6](#36-rediseño-completo-de-referencia-original-vs-genérico) |
| 2 | Cierre de caja semanal | [§2.3](#23-cierre-de-caja-semanal) |
| 3 | Campos inductancia/aislamiento en servicio | [§1.1](#11-campos-inductancia-y-aislamiento) |
| 4 | Precio en servicios | [§1.2](#12-precio-por-servicio-personalizable) |
| 5 | Accesorios deben jalar del inventario real | [§1.3](#13-accesorios-deben-usar-el-inventario-real) |
| 6 | (aclarado: el precio del servicio NO es rígido) — se fusionó en el punto 4/7 | [§1.2](#12-precio-por-servicio-personalizable) / [§1.4](#14-tipo-de-servicio-con-histórico-de-precio) |
| 7 | "Tipo de Servicio" como catálogo persistente con histórico | [§1.4](#14-tipo-de-servicio-con-histórico-de-precio) |
| 8 | Menú lateral pierde posición al navegar | [§4.1](#41-el-menú-lateral-pierde-la-posición-al-navegar) |
| 9 | Limpieza general del frontend (sin duplicados/inútiles) | [§4.4](#44-criterio-transversal-limpieza-del-frontend) |
| 10 | Botón "Anular" solo si la venta está confirmada | [§2.1](#21-botón-anular-solo-si-la-venta-está-confirmada) |
| 11 | (repetido del punto 8, mismo tema) | [§4.1](#41-el-menú-lateral-pierde-la-posición-al-navegar) |
| 12 | Proforma desde la pantalla de códigos de barra | [§2.2](#22-proforma-desde-la-pantalla-de-códigos-de-barra) |
| 13 | Reporte de comparación de precios por proveedor — histórico | [§3.2](#32-reporte-de-comparación-de-precios-por-proveedor) |
| 14 | Botón "Confirmar compra" al final del flujo | [§3.3](#33-botón-confirmar-compra-al-final-del-flujo) |
| 15 | Proceso de clientes y servicios "podría mejorarse" | [§5](#5-punto-sin-definir-todavía) |
| 16 | Formato de código de ubicación más libre | [§3.4](#34-formato-de-código-de-ubicación) |
| 17 | Crear compra sin pre-asociar proveedor-producto | [§3.5](#35-simplificar-la-creación-de-compras) |
| 18 | Bug de foco en ventanas de confirmación | [§4.2](#42-bug-de-foco-tras-una-ventana-de-confirmación) |
| 19 | Tabla de productos: estado, precio de venta, override manual | [§3.7](#37-tabla-de-productos-estado-precio-de-venta-y-override-manual) |
| 20 | Rediseño completo de "referencia": original vs. genérico | [§3.6](#36-rediseño-completo-de-referencia-original-vs-genérico) |

---

## 1. Servicios

Los modelos de servicios viven en `backend/src/apps/customers/` (no hay una app separada
`apps/services/` ni `apps/injectors/`: `Injector` e `InjectorServiceRecord` están ahí también).
Todo lo nuevo en esta sección debe seguir el mismo patrón de capas que ya usa el resto del
proyecto: `models/` → `serializers.py` → `services/*.py` (única capa que puede mutar estado,
`@transaction.atomic`) → `selectors/*.py` (solo lectura) → `views.py` (ModelViewSet + permisos
por módulo en `apps/core/permissions.py`).

### 1.1. Campos "inductancia" y "aislamiento"

**Verificado en el código.** `InjectorServiceRecord` (`apps/customers/models/service_record.py`)
ya tiene dos campos de diagnóstico del mismo tipo:

```python
resistance = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
leakage = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
```

Son opcionales, sin campo de unidad propio (la unidad va como texto de ayuda en el frontend:
"Ohmios." para resistencia, "Mililitros u otra unidad estándar del laboratorio." para leakage).
Se editan en el mismo PATCH que el resto de los datos técnicos, en
`frontend/src/features/services/service-technical-form.tsx`, validados con el patrón compartido
`DECIMAL_PATTERN = /^\d+(\.\d+)?$/` en `frontend/src/features/services/validation.ts`.

**Propuesto:** agregar dos campos siguiendo exactamente el mismo patrón:

```python
inductance = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)  # inductancia
isolation = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)   # aislamiento
```

- Nueva migración en `apps/customers/migrations/` (siguiente después de `0005_...`).
- Agregar ambos a `InjectorServiceRecordSerializer.Meta.fields`.
- Agregar a los tipos y validaciones del frontend (`types.ts`, `validation.ts`, `form-errors.ts`)
  y dos campos nuevos en `service-technical-form.tsx`.

**Decisión pendiente:** confirmar la unidad de medida real de "inductancia" (¿mH?) y
"aislamiento" (¿MΩ?) con el cliente para el texto de ayuda — no se debe inventar la unidad.

### 1.2. Precio por servicio (personalizable)

**Verificado en el código.** `InjectorServiceRecord` **no tiene ningún campo de precio hoy**, y
no existe ningún vínculo entre un servicio y `Sale`/`SaleItem` (`SaleItem.product` solo apunta a
`inventory.Product`). Un servicio terminado hoy no tiene ningún valor monetario registrado en
ningún lado.

**Propuesto:** agregar un campo de precio directamente en `InjectorServiceRecord`, en el mismo
espíritu que `SaleItem.unit_price`:

```python
price = models.DecimalField(
    max_digits=12, decimal_places=4, null=True, blank=True,
    validators=[MinValueValidator(Decimal("0.0001"))],
)
```

Nullable porque el servicio puede existir antes de que se decida el precio (mientras está
`RECEIVED`/`IN_PROGRESS`), editable en cualquier momento antes de `DELIVERED`/`CANCELLED` (mismo
bloqueo que ya existe para `resistance`/`leakage`/`notes_after`). **Nunca se calcula ni se fuerza
desde un catálogo — el usuario lo escribe directamente cada vez**, tal como pidió el cliente
("que se pueda personalizar, que no sea un valor rígido"). El histórico de referencia para saber
cuánto cobrar antes se maneja aparte, en el "Tipo de Servicio" (§1.4).

**Decisión pendiente:** ¿el precio hace que el servicio cuente como ingreso "vendido" de
inmediato, o se necesita un paso de confirmación explícito como en Ventas (`DRAFT → CONFIRMED`)?
Esto afecta directamente al cierre de caja (§2.3), que necesita sumar ingresos por servicios.
Recomendación: sumar el precio de los servicios en estado `DELIVERED` dentro del rango de fechas
del cierre, sin necesitar un estado de "venta" separado — pero es una decisión de negocio, no
técnica, y debe confirmarse antes de implementar el cierre de caja.

### 1.3. Accesorios deben usar el inventario real

**Verificado en el código — este es el cambio más grande de la sección de servicios.** Hoy
"accesorios" es un catálogo **totalmente aislado, sin ninguna relación con `Product`/inventario**:

- `apps/customers/models/accessory.py` → `InjectorAccessory`: solo `name` (único) + `description`.
- `apps/customers/models/service_accessory.py` → `InjectorServiceAccessory`: tabla intermedia con
  FK a `InjectorServiceRecord` y FK a `InjectorAccessory` (no a `Product`), más `quantity` y
  `notes`.
- **Nunca se crea un movimiento de inventario.** `InjectorServiceAccessoryViewSet` en
  `apps/customers/views.py` guarda directo con `serializer.save()`, sin pasar por ningún
  `services/*.py` que descuente stock.
- El propio código del frontend (`frontend/src/features/services/api.ts`) trae un comentario que
  confirma la intención original: *"Accesorios: catálogo global, gestionado inline (igual que las
  categorías de costos de importación en Compras)"* — se diseñó a propósito como una lista
  independiente, no como un buscador de productos.
- La etiqueta visible en la pantalla de detalle de servicio es "Accesorios utilizados"
  (`frontend/src/app/services/[id]/page.tsx`) — **el cliente confirmó que este nombre se queda
  igual**, esto es un cambio de modelo de datos, no de nombre.

**El mecanismo real para descontar stock que hay que reutilizar** (verificado en
`apps/sales/services/sale.py`):

```python
StockMovement.create_from_service(
    product=item.product, movement_type=StockMovementType.EXIT, direction=MovementDirection.OUT,
    quantity=item.quantity, notes=f"Venta #{sale.id}",
    created_by=user, updated_by=user, sale_item=item,
)
```

`StockMovement` no se puede guardar directamente (`_allow_save = False`) — solo a través de
`create_from_service(...)`, que corre `full_clean()`. Las anulaciones (reversas) se hacen creando
un movimiento `REVERSAL` de dirección contraria, enlazado por `reverses_movement` (ver
`cancel_sale()` en el mismo archivo) — este es el patrón que debe seguir también la cancelación de
un accesorio-de-servicio.

**Propuesto:**

1. Cambiar `InjectorServiceAccessory.accessory` (FK a `InjectorAccessory`) por `product` (FK a
   `inventory.Product`), cruzando el límite de apps `customers → inventory` de la misma forma en
   que ya lo hace `apps/sales/models/sale.py`. Mantener `quantity` y `notes`, y la restricción
   única `(service_record, product)` (ya soporta varios productos por servicio sin cambios
   adicionales).
2. Retirar `InjectorAccessory` como catálogo (ya no tiene sentido si "accesorios" pasa a ser
   productos reales) — esto implica una **migración de datos real** si ya existen filas en
   producción (mapear `accessory.name` a un `Product` existente, probablemente a mano, no
   automáticamente). **Riesgo a evaluar antes de implementar**: revisar cuántas filas reales
   existen hoy en `InjectorAccessory`/`InjectorServiceAccessory` antes de decidir cómo migrarlas.
3. Nuevo valor de movimiento `StockMovementType.SERVICE_USE = "SERVICE_USE", "Uso en servicio"`
   en `apps/inventory/models/catalog.py`, y un nuevo FK nullable `service_accessory` en
   `StockMovement` (mismo patrón que los FKs nullable existentes `sale_item`/`purchase_item`).
4. Nueva función de servicio `apps/customers/services/service_accessory.py`:
   `add_service_accessory(*, service_record, product, quantity, notes, user)` — valida stock
   suficiente (reutilizando el selector `current_stock` de inventario, igual que hace
   `apps/sales/services/sale.py`), crea la fila y el `StockMovement` en una transacción, y una
   función paralela de reversa para cuando se elimina un accesorio ya descontado (hoy no existe
   ningún `destroy` que lo prevenga — hay que agregarlo).
5. El frontend (`service-accessory-form.tsx`) pasa de un `<select>` alimentado por
   `getAccessories()` a un buscador de productos igual al que ya existe en
   `frontend/src/features/sales/sale-item-form.tsx` (búsqueda con debounce + `formatProductLabel`),
   mostrando el stock disponible igual que hace ese formulario.

### 1.4. "Tipo de Servicio" con histórico de precio

**Aclaración del cliente (importante, corrige mi entendimiento inicial):** el precio del servicio
**no** es un valor fijo tomado de un catálogo — se escribe directamente en cada servicio (§1.2).
Lo que sí debe ser un catálogo persistente es el **"Tipo de Servicio"** (ej. "arreglar carro"):
una lista reutilizable, editable, que guarda un **histórico de los precios cobrados** cada vez que
se hizo ese tipo de servicio, para que la próxima vez el usuario vea la referencia ("la última vez
cobré ₡X por esto") pero pueda escribir un precio distinto sin que nada se lo impida.

**El patrón existente que hay que imitar, verificado en el código:** `ProductCostHistory`
(`apps/inventory/models/costs.py`) — cada fila guarda un precio calculado con fecha
(`calculated_at`), ordenado `["-calculated_at", "-id"]` así que "el más reciente" es solo "el
primero". Se expone de solo lectura (`ProductCostHistoryViewSet`, filtrable por `?product=`).
En el frontend, `getLatestProductCostHistory()` trae el último y `sale-item-form.tsx` lo muestra
como texto de ayuda bajo el campo de precio (`priceReferenceHint`, nunca precargado en el input,
nunca bloqueante) — exactamente la experiencia que se necesita replicar acá.

**Propuesto** — dos modelos nuevos en `apps/customers`:

```python
class ServiceType(AuditModel, ActivableModel):
    name = models.CharField(max_length=150, unique=True)  # normalizado a mayúsculas al guardar
    description = models.CharField(max_length=255, blank=True)

class ServiceTypePriceHistory(AuditModel):
    service_type = models.ForeignKey(ServiceType, on_delete=models.PROTECT, related_name="price_history")
    service_record = models.ForeignKey(InjectorServiceRecord, on_delete=models.PROTECT, related_name="service_type_history_entries")
    price = models.DecimalField(max_digits=12, decimal_places=4, validators=[MinValueValidator(Decimal("0.0001"))])
    charged_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["-charged_at", "-id"]
```

`InjectorServiceRecord` gana un FK nullable `service_type`. Cada vez que se guarda un precio
(§1.2) en un servicio que tiene `service_type` asignado, se crea una fila en
`ServiceTypePriceHistory` (recomendado: una fila por servicio, no una por cada edición del
precio — usar `unique_together (service_type, service_record)`). Nuevo endpoint de solo lectura
`GET /api/customers/service-type-price-history/?service_type=<id>` igual que
`ProductCostHistoryViewSet`, y un CRUD simple `GET/POST/PATCH /api/customers/service-types/` para
administrar el catálogo. En el formulario de servicio: selector de "Tipo de Servicio" (con
creación rápida inline, igual que tenía el viejo selector de accesorios) que, al elegirse, muestra
el último precio cobrado como ayuda bajo el campo de precio — igual que `sale-item-form.tsx`.

**Riesgo/decisión pendiente:** decidir si el catálogo de "Tipo de Servicio" necesita su propio
permiso de módulo o reutiliza `ServicesPermission` (recomendado por simplicidad, ya que es un
sub-concepto de servicios).

---

## 2. Ventas y caja

### 2.1. Botón "Anular" solo si la venta está confirmada

**Verificado en el código — este es el cambio más simple de todo el backlog.**
`frontend/src/app/sales/[id]/page.tsx`, la condición actual del botón:

```tsx
{loadState.status === "success" &&
  (loadState.sale.status === "DRAFT" || loadState.sale.status === "CONFIRMED") &&
  hasCancelAccess && !cancelActionState.isOpen && (
    <Button type="button" variant="danger" onClick={openCancelForm}>Anular venta</Button>
  )}
```

Los valores reales del enum (`backend/src/apps/sales/models/sale.py`, `SaleStatus`) son
`DRAFT`/`CONFIRMED`/`CANCELLED`.

**Propuesto:** quitar la rama `DRAFT`, dejando solo `loadState.sale.status === "CONFIRMED"`. No
toca `hasCancelAccess` (ese es el permiso de rol agregado en la auditoría de seguridad de agosto,
un eje distinto que se queda igual) ni ninguna lógica de backend — es un cambio de una línea de
JSX.

### 2.2. Proforma desde la pantalla de códigos de barra

**Aclaración del cliente:** la proforma no es una pantalla nueva separada — se agrega como una
segunda opción en la pantalla que **ya existe** para seleccionar productos e imprimir códigos de
barra, igual que ahí ya está el botón de generar etiquetas.

**Verificado en el código.** Esa pantalla es `frontend/src/app/inventory/products/page.tsx`: tabla
de productos con checkbox por fila, y una barra de selección que aparece cuando hay productos
elegidos, con el botón "Generar etiquetas" (`handleGenerateLabels`, llama a
`generateProductLabels()` → `POST /api/inventory/products/labels/`, descarga el PDF como blob).

**Generación de PDF ya existe en el proyecto** con `reportlab` (dibuja directo sobre un canvas, no
es un renderizador de HTML/CSS). Hay dos implementaciones: la que usa el frontend hoy
(`apps/inventory/services/product_labels.py`, acción `labels` del `ProductViewSet`) y una segunda,
ya cableada pero sin usar desde el frontend, en `apps/documents` (`ProductLabelsPdfView`,
`GET /api/documents/product-labels/`) — **`apps/documents` es, por diseño, el lugar pensado para
generación de documentos en general**, así que ahí debería vivir la proforma.

**No existe ningún logo/imagen de marca en el proyecto** — lo que se ve como "logo" en la
aplicación (`frontend/src/components/branding/app-logo.tsx`) es texto con estilos CSS, sin ningún
archivo de imagen. Una proforma "con banner de la empresa" hoy solo puede dibujarse como texto con
`reportlab` (mismo texto que el wordmark actual), salvo que se agregue un archivo de logo nuevo.

**Ya existe un buscador de clientes reutilizable** en `frontend/src/features/sales/sale-form.tsx`
(debounce de 350ms, `searchCustomers()`, dropdown con resultados) — este patrón (no
necesariamente el componente completo) es el que debe copiarse para elegir el cliente de la
proforma.

**Propuesto:**
- Backend: nuevo endpoint en `apps/documents`, ej. `POST /api/documents/proforma/`, recibe
  `{ product_ids: [...], customer_id: <int|null> }`, dibuja con `reportlab` un documento con
  encabezado de empresa, datos del cliente (si se eligió uno), tabla de productos con precio
  (tomado del precio de venta efectivo del producto, ver §3.7) y total. Devuelve el PDF igual que
  las etiquetas.
- Frontend: botón "Crear proforma" junto a "Generar etiquetas" en la barra de selección de
  `inventory/products/page.tsx`. Al hacer clic, un modal chico reutiliza el patrón de búsqueda de
  cliente de `sale-form.tsx` (cliente opcional), y descarga el PDF igual que ya hace
  "Generar etiquetas".

**Decisión pendiente:** si el cliente quiere de verdad un logo gráfico en el PDF, hay que
proveerle un archivo de imagen — no existe ninguno hoy en el repositorio para reutilizar.

### 2.3. Cierre de caja semanal

**Aclaración del cliente:** debe incluir ajustes/diferencias de efectivo, "lo más completo
posible".

**Verificado en el código — hoy no existe absolutamente nada de esto, y está documentado a
propósito como pendiente.** `docs/roadmap.md` ("Fase 11: caja y procesos financieros") dice
explícitamente *"Estado: pendiente de requerimientos. No debe implementarse por suposición."* y
`docs/frontend-audit.md` dice *"El módulo es de ventas, no de caja"* y que forma de pago, efectivo,
cierres, arqueos, etc. **no están definidos**. Se confirmó por búsqueda en todo el código fuente
real que no existe ningún campo de método de pago, efectivo/tarjeta, ni ningún concepto de cierre
o arqueo en ningún lado.

`Sale` (`apps/sales/models/sale.py`) tiene: `customer`, `sale_date`, `currency`, `exchange_rate`,
`status`, datos de confirmación/anulación, `notes` — **sin total guardado** (se calcula al vuelo
con `sale_total()`) y **sin método de pago**. El reporte más parecido que ya existe,
`SalesByDateReportView` (`apps/core/views/reports.py`), agrupa ventas confirmadas por fecha —
**pero solo ventas de producto, nunca incluye servicios.**

**Propuesto (módulo nuevo, no hay nada existente que extender más allá del patrón de reporte):**

1. Agregar método de pago a `Sale` (necesario para saber "cuánto fue efectivo" — esto lo infiere
   Claude como prerrequisito técnico, el cliente no lo pidió con ese nombre exacto, hay que
   confirmarlo):
   ```python
   class PaymentMethod(models.TextChoices):
       CASH = "CASH", "Efectivo"
       CARD = "CARD", "Tarjeta"
       TRANSFER = "TRANSFER", "Transferencia"
       OTHER = "OTHER", "Otro"
   payment_method = models.CharField(max_length=15, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
   ```
   Mismo campo en `InjectorServiceRecord` (junto al precio de §1.2) para que el ingreso de
   servicios también se pueda separar por efectivo/no-efectivo.
2. Nuevo modelo (recomendado: app nueva `apps/cash`, porque agrega datos de `sales` y `customers`
   a la vez, no pertenece del todo a ninguna de las dos):
   ```python
   class CashClosing(AuditModel, ActivableModel):
       week_start = models.DateField()
       week_end = models.DateField()
       expected_cash_total = models.DecimalField(max_digits=12, decimal_places=4)
       counted_cash_total = models.DecimalField(max_digits=12, decimal_places=4)
       difference = models.DecimalField(max_digits=12, decimal_places=4)
       difference_reason = models.TextField(blank=True)  # obligatorio si difference != 0
       status = models.CharField(max_length=10, choices=[("OPEN","Abierto"),("CLOSED","Cerrado")], default="OPEN")
       closed_at = models.DateTimeField(null=True, blank=True)
       closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True)
       notes = models.TextField(blank=True)
       class Meta:
           constraints = [models.UniqueConstraint(fields=["week_start", "week_end"], name="uq_cash_closing_week")]
   ```
3. Función de servicio `close_week(*, week_start, week_end, counted_cash_total, difference_reason, user)`
   que suma ventas confirmadas + servicios entregados con `payment_method=CASH` en el rango,
   calcula la diferencia, exige motivo si no cuadra (igual que ya exige `Sale.cancellation_reason`
   al anular), y marca el cierre como `CLOSED`.
4. Vista de reporte previa (antes de cerrar) que muestre el resumen de la semana en curso, y una
   vista de listado de cierres pasados.
5. Nuevo permiso de módulo `CashClosingPermission` (`view_cash_closing`/`add_cash_closing`/
   `change_cash_closing`) agregado a `apps/core/permissions.py` y a `setup_roles.py`.
6. Frontend: nueva sección `frontend/src/features/cash-closing/` + páginas
   `frontend/src/app/cash-closing/`, modeladas sobre la página de reporte más parecida que ya
   existe, `frontend/src/app/reports/sales-by-date/page.tsx` (filtro de rango de fechas + tabla +
   totales), agregando el campo de efectivo contado y el motivo de diferencia.

**Riesgo/decisión pendiente (la más importante de este punto):** ¿el cierre debe guardar una
"foto" congelada de qué ventas/servicios exactos se incluyeron (una tabla intermedia
`CashClosingSale`/`CashClosingServiceRecord`), para que si una venta se edita o anula después el
cierre histórico no cambie? O basta con recalcular por rango de fechas cada vez que se consulta un
cierre pasado (más simple, pero menos "completo")? El cliente pidió "lo más completo posible", lo
que sugiere la opción de la foto congelada, pero es una decisión de negocio que hay que confirmar
antes de implementar, no asumirla.

---

## 3. Inventario, productos y compras

### 3.1. Referencia duplicada en `SupplierProduct`

**Verificado en el código.** No existe un campo llamado literalmente "referencia" en `Product` —
lo que el cliente identifica como "la referencia" está repartido en dos lugares reales:

1. **Lado producto:** `ProductReference` (`apps/inventory/models/product.py`), tabla satélite con
   `product` (FK), `manufacturer`, `reference_code`, `description` — esto es lo que se rediseña
   por completo en §3.6.
2. **Lado proveedor:** `SupplierProduct.supplier_reference` (`apps/inventory/models/supplier.py`),
   un `CharField` simple ("código usado por el proveedor"), parte de la restricción única
   `(supplier, product, supplier_reference)`. Se usa en serializers, en la búsqueda del picker de
   compras, y se muestra como "Ref. …" en `purchase-item-form.tsx`.

**Propuesto:** eliminar `SupplierProduct.supplier_reference` por completo (campo, serializer,
columna de admin, filtro de búsqueda, campo de formulario en el frontend) y cambiar la
restricción única a `(supplier, product)` — una sola fila por combinación proveedor+producto. Esto
además es **lo que hace posible §3.5** (auto-asociar proveedor-producto al comprar) sin
ambigüedad, porque hoy podrían existir varias filas para el mismo proveedor+producto con distinta
`supplier_reference`. Recomendación: implementar este punto junto con (antes de) §3.5.

### 3.2. Reporte de comparación de precios por proveedor

**Verificado en el código — este punto ya está implementado, no hace falta construir nada.**
`ProductSupplierPricesReportView` (`apps/core/views/reports.py`) ya agrupa por proveedor y, para
cada uno, devuelve **el arreglo completo de compras históricas** (`purchases`, con fecha, número
de factura y precio de cada una), no solo el último precio o el promedio — con un comentario en el
propio código que dice explícitamente que es para poder ver si el precio cambió con el tiempo. El
frontend (`frontend/src/app/reports/product-supplier-prices/page.tsx`) ya tiene un botón
"Ver historial" que despliega esa tabla de compras por proveedor.

**Conclusión:** si el cliente vio este reporte funcionando distinto, probablemente estaba en una
versión vieja del sistema — no hay nada que rediseñar aquí. Si de verdad falta algo, es una mejora
distinta y más chica: una vista que muestre, de una sola vez, todos los productos cuyo precio
cambió en el tiempo (hoy hay que entrar producto por producto) — **esto no fue lo que se pidió
originalmente y debe confirmarse aparte antes de tratarlo como un punto real del backlog.**

### 3.3. Botón "Confirmar compra" al final del flujo

**Verificado en el código.** `frontend/src/app/inventory/purchases/[id]/page.tsx`: el botón vive
hoy en el encabezado de la página (`actions` del `AppShell`), junto a "Editar compra" y "Anular
compra" — visible desde que se carga la página, antes de que el usuario haya cargado líneas,
costos de importación o revisado el resumen de costos. El cuerpo de la página, en orden, es:
tarjeta de estado → líneas de compra → `PurchaseCostsSection` (esta última es literalmente lo
último que se renderiza en la página).

**Propuesto:** sacar el botón de la barra superior y ponerlo como el último elemento de la
página, después de `PurchaseCostsSection` — para que aparezca físicamente al final del flujo real
(cargar líneas → costos de importación → revisar resumen → confirmar), en vez de junto al título.
"Editar compra"/"Anular compra"/"Volver" se quedan en el encabezado porque no son parte de la
secuencia lineal de captura de datos.

### 3.4. Formato de código de ubicación

**Aclaración del cliente:** dejarlo libre — cualquier combinación de letras y números, sin
estructura fija.

**Verificado en el código.** El patrón `^[A-Z][1-9][0-9]{0,3}$` está repetido en **tres lugares**
que deben cambiar juntos: el validador del modelo (`apps/inventory/models/product.py`), un
**segundo validador duplicado** en el serializer (`apps/inventory/serializers/product.py`), y
`LOCATION_CODE_PATTERN` en el frontend (`frontend/src/features/inventory/locations/validation.ts`).
Se confirmó, revisando todo el repositorio, que el código de ubicación **se usa siempre como texto
opaco** — nunca se separa en "letra" + "número" en ningún lugar del código (ni en las etiquetas de
código de barras, ni en la búsqueda de stock por ubicación) — así que cambiar el formato es seguro
desde ese ángulo.

**Un límite real a decidir:** `StorageLocation.code` tiene `max_length=5` en el modelo y en la
migración original. "Cualquier longitud" tal como lo pidió el cliente choca con ese límite —no se
encontró ninguna razón técnica que ate ese límite a 5 caracteres (no se usa para el tamaño del
código de barras ni nada así), así que ampliarlo es de bajo riesgo, pero es una decisión que hay
que confirmar explícitamente (¿de verdad sin límite, o solo "sin estructura fija" dentro de un
límite razonable, ej. 10-20 caracteres?).

**Propuesto:** reemplazar los tres validadores por uno alfanumérico simple (ej. `^[A-Za-z0-9]+$`,
normalizado a mayúsculas igual que hoy), mantener la unicidad, y decidir el `max_length` con el
cliente antes de implementar.

### 3.5. Simplificar la creación de compras

**Verificado en el código.** Hoy, para comprar un producto de un proveedor, primero debe existir
una fila de `SupplierProduct` (la asociación proveedor-producto) — `PurchaseItem.supplier_product`
es un FK obligatorio, y el buscador del formulario de compra (`purchase-item-form.tsx`) solo busca
`SupplierProduct` ya existentes para ese proveedor (`searchSupplierProducts`). Si el producto no
está asociado todavía a ese proveedor, no aparece, y hay que salir del flujo de compra a crear la
asociación aparte (`supplier-product-form.tsx`) y volver. **No hay ninguna validación en el
backend** de que `PurchaseItem.supplier_product.supplier` sea igual al proveedor de la compra — hoy
esto solo lo garantiza la interfaz, no el servidor.

**Depende de §3.1:** con la restricción única simplificada a `(supplier, product)` (sin
`supplier_reference`), un `get_or_create(supplier=..., product=...)` deja de ser ambiguo.

**Propuesto:** el formulario de línea de compra busca productos por código universal en **todo el
catálogo** (`getProducts()`, igual que ya se usa en otras pantallas), sin filtrar por proveedor. Al
seleccionar un producto y confirmar la compra, el backend hace
`SupplierProduct.objects.get_or_create(supplier=purchase.supplier, product=product, defaults={...})`
y arma el `PurchaseItem` contra esa asociación (creándola en el momento si no existía), agregando
también la validación de integridad proveedor-compra vs. proveedor-producto que hoy no existe.

### 3.6. Rediseño completo de "referencia" (original vs. genérico)

**Aclaración completa del cliente:** un producto genérico y uno original de la misma pieza no
deberían ser el mismo registro con el mismo precio — deben ser **productos distintos**, cada uno
con su propio precio y sus propias características, pero **relacionados entre sí**, compartiendo el
mismo "código universal" y la misma ubicación de almacenamiento. Buscando por ese código universal
deberían aparecer tanto el original como todas sus variantes genéricas.

**Este es, con diferencia, el cambio más grande y de mayor riesgo de los 20 puntos.**

**Verificado en el código — qué es `ProductReference` hoy:** una tabla puramente descriptiva, no un
producto vendible aparte: `product` (FK), `manufacturer`, `reference_code`, `description` — **sin
precio ni ubicación ni ningún enganche con stock**. `StockMovement.product` solo apunta a
`Product`, nunca a `ProductReference` — hoy una "referencia" no se puede comprar, vender ni tener
stock propio, es metadata de un único `Product`. La búsqueda universal
(`apps/core/views/search.py`) devuelve `ProductReference` como una categoría de resultado
**separada**, no fusionada con `Product` — hoy buscar un código universal no junta "el original más
sus genéricos" como una sola familia.

**El obstáculo estructural central:** `Product.standard_code` es `unique=True` (en el modelo y en
el serializer). Dos filas `Product` distintas, con precio y stock independientes, **no pueden hoy
compartir el mismo "código universal"** — que es exactamente lo que pide el cliente.

**Tampoco existe ningún campo de precio en `Product`, en ningún lado** — el único "precio" que
existe hoy es `ProductCostHistory.suggested_price`, una foto calculada por compra (ver §3.7). Esto
significa que el precio-por-variante que pide este punto y el precio-de-venta-editable que pide
§3.7 son **el mismo hueco**, y deben diseñarse juntos: el campo de precio que se agregue para §3.7
es exactamente el precio-por-variante que necesita este punto.

**Se verificó que el riesgo de relajar la unicidad es bajo:** en todo el backend de producción, la
única verificación de `standard_code` único es la del propio serializer al validar duplicados — no
hay ningún `.get(standard_code=...)` que asuma una sola fila y que se rompería silenciosamente
(`MultipleObjectsReturned`) si dos productos comparten código.

**Dos opciones de diseño (con recomendación):**

- **Opción 1 (recomendada): `Product` sigue siendo la única fuente de verdad; se relaja su
  unicidad.** Quitar `unique=True` de `standard_code`; cada variante (original, genérico A,
  genérico B…) es su propia fila `Product`, con su propio precio (el campo nuevo de §3.7) y su
  propio stock — como `StockMovement`/`SupplierProduct`/`PurchaseItem` ya apuntan directo a
  `Product`, cada variante obtiene stock y compras independientes automáticamente, **sin tocar esa
  parte del sistema**. Se agrega: (a) la relajación de unicidad, (b) el campo de precio (compartido
  con §3.7), (c) una regla a nivel de serializer que obligue a que todas las filas con el mismo
  `standard_code` compartan la misma `storage_location` (si el código ya existe en otra ubicación,
  rechazar o forzar la misma), y (d) actualizar la búsqueda universal y las pantallas de producto
  para agrupar y mostrar juntas las filas con el mismo código. `ProductReference` puede retirarse
  (su función pasa a cumplirla directamente tener varias filas `Product` con el mismo código) o
  mantenerse solo para referencias cruzadas de fabricante que de verdad no necesitan precio/stock
  propio — **esto es una decisión de producto que hay que confirmar con el cliente.**
- **Opción 2 (no recomendada): darle precio y stock a `ProductReference`.** Obligaría a que
  `StockMovement`, `SupplierProduct`, `PurchaseItem` y cualquier FK del lado de ventas acepten
  tanto un `Product` como un `ProductReference` (herencia, FK genérica, etc.), tocando compras,
  ventas, movimientos de stock y reportes a la vez — duplica casi toda la responsabilidad de
  `Product` en una segunda tabla para llegar al mismo resultado. Más invasivo que la Opción 1 sin
  ninguna ventaja real.

**Riesgos de migración a marcar explícitamente antes de implementar:**
1. Relajar la unicidad de `standard_code` es compatible hacia atrás (los datos existentes, un
   producto por código, siguen funcionando igual) — el riesgo está en el comportamiento nuevo hacia
   adelante, no en migrar lo que ya existe.
2. Si se decide convertir filas de `ProductReference` en filas `Product` completas, eso sí es una
   migración de datos real: cada una necesitaría su propia `storage_location` (copiada de su
   producto padre), arrancaría con stock cero (nunca tuvo movimientos propios) y sin histórico de
   precio — hay que decidir explícitamente qué hacer con las `ProductReference` existentes antes de
   tocar el modelo.
3. El plan de migración legacy de DBF (descrito en `docs/data-model.md`) asume hoy que el código
   identifica un único producto — debe revisarse y ajustarse antes de correr esa migración, una vez
   que los códigos dejen de ser 1 a 1 con los productos.
4. El mensaje de error actual de "código duplicado" en `ProductSerializer.validate_standard_code`
   debe reemplazarse por la nueva validación consciente de "familia" (incluida la validación de
   ubicación compartida), no simplemente eliminarse — si no, se podrían crear variantes con
   ubicaciones distintas por accidente.

### 3.7. Tabla de productos: estado, precio de venta y override manual

**Verificado en el código.** La columna "Estado" (Activo/Inactivo) de la tabla de productos
(`frontend/src/app/inventory/products/page.tsx`) es hoy solo una etiqueta visual — no responde a
clics, no ordena, no filtra nada. El filtro real de activo/inactivo está en un `<select>` aparte,
arriba de la tabla, desconectado de esa columna — de ahí la queja del cliente de que "no se puede
filtrar" desde ahí.

**No existe ningún precio en la tabla, ni en el modelo `Product` en absoluto.** El "precio de
venta" que hoy se ve en la pantalla de detalle de un producto es únicamente
`ProductCostHistory.suggested_price` (el más reciente), calculado solo cuando se corre
"Calcular costos" sobre una compra (`margen % → precio sugerido`) — nunca se muestra en la lista,
solo en el detalle.

**Propuesto:**
1. Corregir la columna de estado: que el propio badge sea clickeable para alternar/fijar el
   filtro de activo/inactivo (lo mínimo), en vez de dejarla como decoración desconectada del
   filtro real.
2. Agregar una columna "Precio de venta" a la lista, con el mismo dato que ya se muestra en el
   detalle (`ProductCostHistory.suggested_price` más reciente) — como la lista carga muchos
   productos a la vez, esto necesita resolverse en el backend con una subconsulta/anotación por
   producto (el "último costo por producto"), no con una llamada por fila desde el frontend.
3. Agregar un campo nuevo `Product.custom_sale_price` (Decimal, mismo formato que los demás campos
   de dinero) que, cuando está definido, **tiene prioridad sobre el precio calculado** — el
   usuario lo escribe directo en el producto y esa es la regla: "precio efectivo = custom_sale_price
   si existe, si no, el último suggested_price calculado." Este es el mismo campo de precio que
   necesita §3.6 para que cada variante (original/genérico) tenga su propio precio — se diseñan
   como un solo campo, no dos.

**Decisión pendiente:** revisar (fuera del alcance de esta investigación) si el módulo de ventas
usa hoy algún precio por defecto al crear una línea de venta, para asegurarse de que también lea
`custom_sale_price` cuando exista, y no solo el precio calculado.

---

## 4. Frontend transversal (bugs y UX)

### 4.1. El menú lateral pierde la posición al navegar

**Verificado en el código — es un problema estructural, no un bug puntual.** La aplicación tiene
un único `layout.tsx` raíz casi vacío; `AppShell` (que contiene el menú lateral) se importa y
renderiza **dentro de cada uno de los ~50 archivos `page.tsx`** del proyecto, no en un layout
compartido. En Next.js App Router, esto significa que **cada navegación desmonta por completo el
`AppShell` anterior y monta uno nuevo** — el `<aside>` del menú es un nodo del DOM recién creado en
cada click, así que siempre arranca con `scrollTop = 0`. No es un problema de "restauración de
scroll" fallando: es un remount completo. Se confirmó además que hoy no existe ningún estado de
"sección expandida/colapsada" — todas las secciones del menú están siempre expandidas, así que el
síntoma reportado es 100% explicado por la pérdida de posición de scroll en cada remount.

**Propuesto — dos niveles:**

1. **Arreglo inmediato, de bajo riesgo:** guardar la posición de scroll del menú en
   `sessionStorage` (el proyecto ya tiene un módulo equivalente para el token de sesión en
   `frontend/src/features/auth/storage.ts`, mismo patrón a copiar) y restaurarla en un
   `useLayoutEffect` al montar — como `AppShell` se re-monta en cada navegación, este efecto corre
   cada vez y reaplica la posición guardada antes de que se vea el salto visual.
2. **Arreglo estructural, más completo:** mover `AppShell` a un layout persistente de Next.js
   (ej. `frontend/src/app/(app)/layout.tsx`, sin cambiar ninguna URL) para que el `<aside>` del
   menú nunca se desmonte entre navegaciones — esto es más correcto pero toca las ~50 páginas que
   hoy pasan `title`/`actions` como props directamente a `AppShell` (habría que moverlo a un
   contexto tipo `usePageHeader()`). Recomendación: hacer el arreglo #1 ahora y dejar el #2
   documentado como mejora de arquitectura para más adelante.

### 4.2. Bug de foco tras una ventana de confirmación

**Aclaración del cliente:** pasa siempre, sin excepción, cada vez que aparece una ventana
emergente de confirmación.

**Verificado en el código — no existe ningún componente de modal/diálogo propio en todo el
proyecto.** Las ~20 confirmaciones de la aplicación (eliminar línea de venta, confirmar venta,
anular compra, etc., en `frontend/src/app/**/page.tsx` y varios formularios) usan directamente
`window.confirm()` del navegador — ninguna guarda ni restaura el foco alrededor de esa llamada.

**Por qué es 100% reproducible en este proyecto en particular:** la aplicación corre como app de
escritorio Electron en Windows, y `infra/windows/electron/main.js` ya documenta (en comentarios en
español) un bug conocido y confirmado de Electron/Chromium en Windows
(`electron/electron#20464`, cerrado como "not planned" por los mantenedores): la ventana recupera
el foco del sistema operativo tras un diálogo nativo, pero **el contenido web no recupera el foco
del elemento específico que estaba activo**. La mitigación que ya existe en `main.js` (reenfocar
`webContents` con un watchdog) solo resuelve "la página puede recibir teclado de nuevo", no "cuál
campo debía quedar enfocado" — eso es responsabilidad del frontend, y hoy no lo hace nadie.
`window.confirm()` es justo el tipo de diálogo nativo que dispara el bug documentado, y como
ningún sitio de los ~20 restaura el foco después, se reproduce siempre, en cualquiera de ellos.

**Propuesto (arreglo dirigido, no un rediseño completo):** un helper compartido nuevo, ej.
`frontend/src/lib/dom/confirm-with-focus.ts`:

```ts
export function confirmWithFocusRestore(message: string): boolean {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const result = globalThis.confirm(message);
  if (previouslyFocused?.focus) {
    setTimeout(() => previouslyFocused.focus(), 0); // después del watchdog de main.js
  }
  return result;
}
```

Reemplazar mecánicamente las ~20 llamadas a `globalThis.confirm(...)` por
`confirmWithFocusRestore(...)`. Es un cambio chico, centralizado, y compatible con la mitigación
que ya existe del lado de Electron (no la duplica ni compite con ella).

**Alternativa a más largo plazo** (documentada, no urgente): reemplazar `window.confirm()` por un
componente de confirmación propio en React (evitando el diálogo nativo del sistema operativo por
completo, y de paso permitiendo estilizarlo con la marca de la empresa) — cambio más grande, no
necesario para resolver el bug reportado.

### 4.3. Repetición del punto 4.1

La nota original #11 ("que cuando seleccioné algo quede donde me quedé") es, según confirmó el
cliente, el mismo tema del menú lateral — no es un punto adicional, se cubre con la solución de
§4.1. Si en la práctica aparece en otra pantalla distinta al menú (por ejemplo, dentro de una
tabla o un resultado de búsqueda), hay que señalarlo específicamente para tratarlo aparte.

### 4.4. Criterio transversal: limpieza del frontend

Esto no es una tarea puntual sino un criterio a aplicar en todo lo demás: quitar del frontend
cualquier campo o control que no se vaya a usar de verdad (el ejemplo que dio el cliente es
exactamente `SupplierProduct.supplier_reference`, §3.1) — aunque el campo se quede vacío/sin uso
documentado en el backend por ahora, no debe aparecer en la interfaz si no aporta nada real. Se
debe aplicar este criterio en cada uno de los cambios de este documento, no tratarlo como una
tarea separada.

---

## 5. Punto sin definir todavía

La nota original #15 ("el proceso de clientes y servicios siento que podría mejorarse") **no tiene
contenido concreto** — es una sensación general, sin un problema específico identificado. No se
investigó contra el código porque no hay nada verificable todavía. Antes de poder documentarlo o
implementarlo, hace falta que el cliente/dueño del proyecto identifique qué específicamente le
molesta o qué le falta a ese proceso.

---

## 6. Dependencias entre puntos (a tener en cuenta al planear el orden de implementación)

- **§3.1 antes de §3.5**: simplificar la clave de `SupplierProduct` (quitar `supplier_reference`)
  es lo que permite que el auto-asociar proveedor-producto al comprar (§3.5) sea seguro y sin
  ambigüedad.
- **§3.6 y §3.7 comparten el mismo campo nuevo**: el precio por variante que pide el rediseño de
  referencias (§3.6) y el precio de venta editable de la tabla de productos (§3.7) son el mismo
  hueco (`Product` no tiene ningún campo de precio hoy) — se deben diseñar e implementar juntos,
  no por separado.
- **§1.2 antes de §2.3**: el cierre de caja necesita sumar ingresos de servicios, lo que requiere
  que los servicios ya tengan precio (§1.2) y, probablemente, método de pago (nuevo campo
  propuesto en §2.3).
- **§3.6 es, con diferencia, el punto de mayor riesgo y alcance de los 20** — se recomienda
  planearlo y estimarlo aparte del resto, no mezclarlo en el mismo lote que los demás cambios,
  más chicos y en su mayoría aditivos.

---

## 7. Archivos clave por dominio (para retomar la investigación rápido en el chat nuevo)

- **Servicios/accesorios/tipo de servicio**: `apps/customers/models/{accessory,service_accessory,service_record,injector}.py`, `apps/customers/{serializers.py,views.py,urls.py,services/,exceptions.py}`, `frontend/src/features/services/`, `frontend/src/app/services/`.
- **Ventas/cierre de caja/proforma**: `apps/sales/models/sale.py`, `apps/sales/services/sale.py`, `apps/sales/selectors/sale.py`, `apps/documents/{pdf.py,views.py}`, `apps/core/views/reports.py`, `frontend/src/app/sales/`, `frontend/src/app/reports/`, `frontend/src/app/inventory/products/page.tsx` (pantalla de códigos de barra).
- **Inventario/productos/compras/referencias**: `apps/inventory/models/{product,supplier,purchase,stock,catalog,costs}.py`, `apps/inventory/{serializers/,views/,services/}`, `frontend/src/features/inventory/`, `frontend/src/app/inventory/`.
- **UX transversal**: `frontend/src/components/layout/app-shell.tsx`, `frontend/src/components/navigation/app-navigation.tsx`, `frontend/src/features/auth/storage.ts` (patrón de storage a copiar), `infra/windows/electron/main.js` (bug de foco documentado del lado de Electron).
