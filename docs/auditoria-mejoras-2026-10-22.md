# Auditoría y plan de trabajo: servicios, etiquetas, caja y traslados (2026-10-22)

> **Qué es este archivo.** Es el prompt y el material de apoyo para implementar los 6 puntos que
> Alejandro pidió el 2026-10-22, más un séptimo que salió de sus respuestas (crear lo que falta
> desde el mismo formulario). Todo lo que dice aquí se verificó leyendo el código real en el commit
> `4561188` (versión 2.4.0), rama `main`. **No se cambió ningún archivo de código durante la
> auditoría.** Antes de tocar cada punto hay que volver a leer los archivos: el código puede haber
> cambiado desde esa fecha.
>
> Las decisiones de la sección 3 se tomaron con Alejandro en dos rondas: primero eligió, después
> pidió que se revisaran críticamente y ajustó varias (por ejemplo, descartó "varios inyectores
> por servicio" y "devoluciones desde la otra sede"). La sección 3 tiene la versión final.

---

## 0. PROMPT PARA EL CHAT QUE VA A IMPLEMENTAR

Copie desde aquí hasta el final de la sección 0 como primer mensaje del chat nuevo, y adjunte este
archivo completo.

> Vas a implementar, uno por uno, los puntos descritos en `docs/auditoria-mejoras-2026-10-22.md`
> del sistema LICS (backend Django REST en `backend/src`, frontend Next.js/TypeScript en
> `frontend/src`). La auditoría ya identificó los archivos, las causas y una propuesta de cambio
> para cada punto, además de las decisiones que ya tomé. Reglas obligatorias:
>
> 1. **No deduzcas ni inventes nada.** Antes de proponer un cambio, lee el código real de todos los
>    archivos que menciona la auditoría para ese punto y confirma que lo que dice sigue siendo
>    cierto. Si algo no coincide, detente y avísame.
> 2. **Si el cambio toca una función, un método, un serializer, un tipo o un componente, busca
>    TODOS los lugares donde se usa** (`grep` en backend y frontend) y revisa que no rompa ninguno.
>    En tu propuesta, enumera los usos que encontraste.
> 3. **Un punto a la vez, con cambios quirúrgicos.** No reformatees, no renombres ni "mejores"
>    código que no forma parte del punto.
> 4. **Tests en cada cambio.** Todo cambio de backend lleva tests nuevos o actualizados. Todo cambio
>    de frontend debe pasar `lint` y `build` (no hay runner de tests de frontend; no agregues uno
>    sin preguntarme).
> 5. **Ciclo por punto:** (a) lees y me explicas lo que encontraste y el cambio exacto → (b) espero
>    mi visto bueno si hay una decisión que no esté en la sección 3 → (c) editas → (d) me das los
>    comandos → (e) yo corro tests, lint y build y te paso el resultado → (f) me das el commit en
>    una sola línea (`git add <rutas> && git commit -m "tipo: resumen corto"`) → (g) yo hago el
>    commit → (h) siguiente punto.
> 6. **Tú editas archivos; yo corro TODOS los comandos de shell** (migrate, test, lint, build y todo
>    git). Si un comando falla, me das el comando corregido.
> 7. **Toda migración se explica antes de correrla:** qué hace, si es aditiva o destructiva y qué
>    pasa con los datos existentes.
> 8. **Si una decisión no está en la sección 3, pregúntame** antes de implementar. La sección 5
>    marca esas dudas con "PREGUNTAR" y la sección 7 las resume.
> 9. Sigue el orden de la sección 4 salvo que yo diga otra cosa. Al terminar cada punto, marca su
>    casilla en la sección 6.
> 10. La estética es prioridad. Los textos de la interfaz son neutros e informativos, no
>     imperativos ("Se crea un respaldo…", no "Haga un respaldo…").
>
> Empieza por el punto 5 (el primero del orden recomendado). Primero lee los archivos y dime qué
> encontraste.

---

## 1. Contexto del sistema

### 1.1. Comandos (los corre Alejandro)

- Backend completo: `make test` (con `--buffer`: solo muestra la salida de lo que falla). Por app:
  `docker compose -f infra/docker/compose.yml exec backend python src/manage.py test --buffer
  apps.<app>`.
- Migraciones: `make makemigrations` y `make migrate`.
- Frontend (dentro de `frontend/`): `npm run lint` y `npm run build`.
- Al cambiar un permiso de módulo, correr siempre también `apps.core`: `apps/core/tests.py:454`
  verifica la cantidad total de permisos de módulo (hoy **38**) y la matriz rol-permiso.

### 1.2. Permisos

- `backend/src/apps/core/models.py` → `ModulePermissions.Meta.permissions` (38 permisos).
  `backend/src/apps/core/permissions.py` → `ModulePermission` resuelve el permiso según la acción:
  `cancel_actions` → `cancel_`; `read_actions` → `view_`; `create` → `add_`; métodos seguros →
  `view_`; lo demás → `change_`. Superusuario y grupo `ADMIN` pasan siempre.
- Reglas de solo Administrador sin permiso propio: `ModuleAdminRequired` / `is_module_admin`
  (precio y entrega de servicios, tipos de servicio). `ViewCostsRequired` para costos.
- `setup_roles.py` → `ROLE_PERMISSIONS`. Corre en cada actualización (`scripts/update.sh`). El
  frontend replica los roles a mano en `frontend/src/features/auth/permissions.ts`: todo cambio de
  roles va en los dos lados. Detalle en `docs/security.md`.

### 1.3. Patrones establecidos (reutilizarlos)

- Movimientos de stock solo con `StockMovement.create_from_service(...)`. Reversión = movimiento
  `REVERSAL` con dirección contraria, misma cantidad y `reverses_movement=<original>`. Un movimiento
  `ENTRY` exige `purchase_item`, un `EXIT` exige `sale_item` y un `SERVICE_USE` exige
  `service_accessory` (`StockMovement.clean`, `apps/inventory/models/stock.py`).
- Líneas atadas a stock o dinero son inmutables: se borran y se crean de nuevo.
- Montos de documentos: un solo cálculo en `apps/core/money.py` (`compute_document_amounts`), con
  espejo en `frontend/src/lib/document-amounts.ts`. Ventas y servicios congelan sus montos al
  confirmar o entregar. Caja y reportes cuentan con `confirmed_sales()` y `delivered_services()`.
- Una transición que fija un monto en dinero valida que no sea nulo (`ServiceMissingPriceError`).
- PDF de documentos: `apps/documents/pdf.py` (`_build_itemized_document_pdf`, banner de marca).
  PDF de reportes: `apps/documents/report_pdf.py`. Excel: `apps/documents/report_xlsx.py`.
- Etiquetas que imprime la pantalla: `apps/inventory/services/product_labels.py`
  (`POST /api/inventory/products/labels/`). El código de barras es el código propio o, si no hay,
  el universal (`label_barcode_value`).
- Navegación: la edición se entra y se sale con `router.replace`; cancelar una creación usa
  `goBackOr` (`frontend/src/lib/navigation/go-back.ts`).
- `setState` dentro de un `useEffect` de montaje va diferido (regla `react-hooks/set-state-in-effect`).
- Montos en pantalla: `formatMoney` de `features/inventory/purchases/format.ts`.

---

## 2. Cómo leer la sección 5

Cada punto tiene: **Estado verificado** (lo que hace hoy el código), **Cambio propuesto**, **Usos a
revisar**, **Tests**, **Migración** y **Dudas**. "PREGUNTAR" quiere decir que la decisión no está
tomada y hay que consultarla antes de implementar.

---

## 3. Decisiones tomadas con Alejandro (2026-10-22)

| Tema | Decisión |
|---|---|
| Varios inyectores por servicio (punto 1) | **No.** Un servicio sigue siendo un inyector. Se descartó después de revisarlo: nadie lo pidió y complica todo. |
| Cantidades en servicios (punto 1) | **Cobro por líneas:** "Mano de obra" (u otros conceptos) con cantidad y precio, más los accesorios, cada uno con su precio. El total se calcula solo. |
| Precio que se acumula (punto 3) | **Separar mano de obra y accesorios** (va junto con el cobro por líneas). El precio de cada accesorio queda fijo al agregarlo. |
| Tipo de servicio (punto 1) | Formulario completo: **precio de mano de obra**, **descripción / qué incluye** y **pantalla para administrarlos**. El kit de accesorios se hizo y se **quitó** (2026-10-23): proponía descontar inventario por suposición y era fácil descuadrar el stock; los accesorios se agregan a mano con lo que de verdad se usó. |
| Recepción del servicio (punto 1) | **Todo en un formulario** al recibir, con **crear cliente e inyector desde ahí**. |
| Crear desde el formulario (punto 7) | **Ventana encima** que reutiliza el formulario que ya existe; al guardar queda elegido y no se pierde lo escrito. Un solo nivel de ventana. Se replica en otras partes (producto → ubicación, compra → producto, etc.). |
| Orden de productos (punto 2) | La lista se puede ordenar (código, nombre, descripción, ubicación, existencia, fecha de registro, fecha de modificación; ascendente o descendente) y **recuerda el último orden**. Al imprimir etiquetas **se elige el orden**, propuesto con el de la lista. |
| Copias de etiquetas (punto 4) | **1 por producto** por defecto; se cambia la cantidad de cada uno, con un atajo para poner la misma a todos. |
| Cierre de caja (punto 5) | **"Debe haber al contar" grande y centrado**, como protagonista. "Total cobrado" solo **centrado** (hoy sale a la izquierda), sin agrandarlo. |
| Traslado a la otra sede (punto 6) | **Documento con líneas** (borrador → confirmar, que descuenta inventario; anulable, que lo devuelve), con **PDF de guía de traslado**. **Solo el Administrador.** **Solo salidas:** no hay devoluciones desde la otra sede. |

**Recomendaciones que se toman salvo que Alejandro diga otra cosa** (se le presentaron el
2026-10-22 junto con la revisión de sus decisiones):

- Los traslados **no cuentan** en "Productos que más se mueven" (no son rotación del negocio); sí en
  Movimientos y en Bajo mínimo.
- La guía de traslado lleva **solo cantidades**, sin costos ni precios.
- La otra sede se elige de un **catálogo de "Sedes"** (hoy con una), no se escribe a mano.
- El código se ordena de forma **natural** (A2 antes que A10).
- Los accesorios siguen siendo **del servicio**.
- **Servicios existentes:** se migran con **una sola línea "Servicio"** con el precio que tenían y
  los accesorios en ₡0, para que el dinero cuadre exacto sin adivinar cuánto era mano de obra.
- En el formulario nuevo se pueden **corregir el inyector y la fecha de recepción** mientras el
  servicio no esté entregado (el backend ya lo permite; la pantalla no).

---

## 4. Orden recomendado

| Paso | Punto | Por qué en este orden |
|---|---|---|
| 1 | 5 — Totales del cierre de caja | Solo pantalla, rápido, sin riesgo. |
| 2 | 1A — Tipo de servicio completo | Base de lo que sigue: el precio de mano de obra sale de aquí. |
| 3 | 3 + 1B — Cobro por líneas | Arregla el error del precio que se acumula, que hoy da cobros equivocados. Usa el precio del tipo (1A). |
| 4 | 4 + 2 — Copias y orden de productos y etiquetas | Comparten el endpoint de etiquetas. |
| 5 | 6 — Traslados a la otra sede | Independiente de los anteriores; módulo nuevo. |
| 6 | 7 — Crear desde el formulario (ventana) | Componente de ventana nuevo, primero en los formularios de inventario. |
| 7 | 1C — Formulario completo de recepción | Junta todo: usa la ventana (7), el tipo (1A) y las líneas (1B). |

Versión: todo esto va en la **2.5.0**.

---

## 5. Los puntos

### Punto 5. Cierre de caja: "Debe haber al contar" grande y centrado

- **Estado verificado:**
  - `frontend/src/features/cash/cash-closing-form.tsx:303-339`: el desglose esperado es una grilla
    de 4 columnas y "Total esperado" va en una fila aparte, **alineado a la izquierda** y en
    `text-base`.
  - "Debe haber al contar" está en `frontend/src/features/cash/petty-cash-summary.tsx:93-106`: una
    barra con el texto a la izquierda y el monto a la derecha (`text-2xl`). La usan el formulario y
    el detalle del cierre.
  - En el detalle (`frontend/src/app/cash/[id]/page.tsx:282`) la primera tarjeta es "Debía haber",
    con el texto "Cobrado ₡X más el saldo de caja chica".
- **Cambio propuesto:**
  1. "Debe haber al contar" (y "Debía haber" en el detalle): bloque **centrado**, monto grande
     (por ejemplo `text-4xl`/`text-5xl`, `font-mono`), con la explicación debajo ("Lo cobrado más el
     saldo de caja chica"). Es el número contra el que se compara lo contado: el campo "Total
     contado" y la diferencia van justo después, visualmente ligados.
  2. "Total esperado" del desglose: **centrado**, sin agrandarlo.
  3. Nombres: el formulario dice "Total esperado" y el detalle dice "Cobrado". Proponer unificar en
     **"Total cobrado"** para que no se confunda con "Debe haber al contar". PREGUNTAR antes de
     cambiar el texto.
- **Usos a revisar:** `PettyCashSummary` (formulario y detalle), `cash/[id]/page.tsx`.
- **Tests:** solo frontend (lint y build).
- **Migración:** no.

> **Nota (2026-10-23):** lo del kit que sigue en los puntos 1A, 1B y 1C se descartó; ver la
> sección 3.

### Punto 1A. Tipo de servicio completo

- **Estado verificado:**
  - `apps/customers/models/service_type.py`: `ServiceType` tiene solo `name` (único, se guarda en
    mayúsculas), `description` (`CharField(255)`) y `is_active`. No tiene precio.
  - `ServiceTypePriceHistory` guarda "lo cobrado la última vez que se usó el tipo". Es la fuente
    del error del punto 3: ver ese punto.
  - `ServiceTypeViewSet` (`apps/customers/views.py:442`): leer con `view_services`; crear y editar
    solo el Administrador (`ModuleAdminRequired`).
  - **No existe pantalla** de tipos de servicio: solo el botón "Nuevo" dentro del formulario de
    precio del servicio (`features/services/service-price-form.tsx:294`), que crea con solo el
    nombre.
- **Cambio propuesto:**
  1. `ServiceType`: `default_labor_price` (Decimal, opcional) y `description` pasa a `TextField`
     ("qué incluye", puede salir en la factura).
  2. Modelo nuevo `ServiceTypeAccessory` (tipo, producto, cantidad; único por tipo y producto): el
     kit.
  3. Pantalla `/services/types` (lista con buscador y activo/inactivo, crear, editar, desactivar),
     solo para el Administrador, con el kit editable (buscar producto + cantidad).
  4. El botón "Nuevo" del formulario del servicio abre la ventana del punto 7 con este mismo
     formulario (o, si se hace antes del punto 7, lleva a la pantalla).
- **Usos a revisar:** `ServiceTypeSerializer`, `service-price-form.tsx` (selector de tipo), el
  admin de Django, `seed_demo_data`.
- **Tests:** crear y editar con precio y kit; el kit no admite el mismo producto dos veces; solo el
  Administrador escribe; Clientes y servicio lee el catálogo.
- **Migración:** aditiva (`AddField` del precio, `AlterField` de la descripción a texto,
  `CreateModel` del kit). No cambia datos.
- **Dudas:** el kit se propone al elegir el tipo en el servicio. Eso se implementa en 1B y 1C.

### Punto 3 + 1B. Cobro por líneas (y el precio que se acumula)

- **Estado verificado (la causa del error):**
  1. Al guardar el servicio, `InjectorServiceRecordViewSet.perform_update`
     (`apps/customers/views.py:299`) llama a `sync_service_type_price_history`
     (`apps/customers/services/service_type.py`), que guarda en el historial del tipo el
     **`price` completo del servicio**, que ya incluye los accesorios.
  2. La pantalla (`features/services/service-price-form.tsx:242-249`) toma el último precio del
     historial como "precio del tipo de servicio" y le **suma otra vez los accesorios**:
     `suggestedTotal = serviceTypePrice + accessoriesTotal`.
  3. Resultado: 100 + 50 = 150 se guarda como precio del tipo → la próxima sugerencia es 150 + 50 =
     200 → se guarda 200 → 250… Además, el último del historial puede ser **el mismo servicio**,
     así que pasa incluso sin cambiar de servicio.
  - Los accesorios (`InjectorServiceAccessory`) **no guardan precio**: el total de accesorios se
    calcula en vivo con el precio de venta actual del producto
    (`app/services/[id]/page.tsx:213`). Si el precio del producto cambia antes de entregar, el
    total sugerido cambia solo.
  - `price` es hoy el subtotal escrito a mano; caja, reportes y factura lo usan a través de
    `service_amounts` / `live_service_amounts` (`apps/customers/selectors/service_record.py`).
- **Cambio propuesto:**
  1. Modelo nuevo `ServiceChargeLine` (servicio, tipo de servicio opcional, descripción, cantidad,
     precio unitario): "Mano de obra × 1", "Limpieza × 4", etc.
  2. `InjectorServiceAccessory.unit_price`: se fija al agregar (por defecto, el precio de venta del
     producto en ese momento; el Administrador puede escribir otro).
  3. `price` deja de escribirse a mano: lo recalcula el servicio de dominio cada vez que cambia una
     línea o un accesorio = Σ líneas + Σ accesorios. Se mantiene como columna para que caja,
     reportes, factura y montos congelados no cambien (siguen leyendo `price` como subtotal).
  4. Al elegir un tipo en una línea, se precarga su `default_labor_price` (punto 1A) y se proponen
     los accesorios de su kit para confirmar.
  5. `ServiceTypePriceHistory`: deja de usarse. Recomendación: **borrar el modelo**, porque sus
     datos están contaminados (son totales con accesorios) y el precio de referencia pasa a ser el
     del tipo. PREGUNTAR antes (es la única parte destructiva).
  6. Permisos (punto 25 de la auditoría anterior): las líneas de cobro y el precio de los
     accesorios son solo del Administrador; el operario sigue agregando accesorios sin ver
     precios (el precio se fija igual, con el de venta).
  7. Factura del servicio (`build_service_invoice_pdf`): pasa a detallar líneas y accesorios con
     sus importes, con el resumen de descuento e impuesto que ya existe.
- **Usos a revisar:** `service_amounts`/`live_service_amounts`, `deliver_service` (exige precio:
  ahora, al menos una línea o un accesorio con precio), `service-price-form.tsx` (pasa a ser la
  sección de cobro), `app/services/[id]/page.tsx`, `build_service_invoice_pdf`,
  `seed_demo_data`, tests de `apps/customers`, `apps/cash`, `apps/documents` y del resumen de
  ventas (que crean servicios con `price=`).
- **Tests:** el subtotal es la suma de líneas y accesorios; agregar o borrar una línea recalcula
  `price`; el precio del accesorio no cambia si después cambia el del producto; volver a aplicar el
  precio del tipo **no acumula**; el operario no puede escribir precios; la caja suma lo mismo que
  antes para un servicio migrado.
- **Migración:** aditiva para el esquema (`CreateModel` de las líneas, `AddField unit_price` con
  default 0) más una migración de datos: cada servicio existente con precio recibe **una línea
  "Servicio"** con ese precio y su tipo; sus accesorios quedan en ₡0. Así `price` no cambia en
  ningún servicio y los montos congelados tampoco. (Borrar `ServiceTypePriceHistory`, si se
  aprueba, va en una migración aparte y es destructiva.)

### Punto 1C. Formulario completo de recepción

- **Estado verificado:**
  - `app/services/new/page.tsx` + `features/services/service-record-create-form.tsx`: "Recibir
    inyector" pide **solo** el inyector (que ya debe existir) y la fecha. El resto se llena después
    en tres tarjetas del detalle: precio, datos técnicos (`service-technical-form.tsx`) y
    accesorios (`service-accessory-form.tsx`).
  - Si el cliente o el inyector son nuevos, hay que salir a crearlos en sus pantallas.
  - El serializer permite cambiar el inyector y la fecha mientras el servicio no esté entregado,
    pero la pantalla no lo ofrece.
- **Cambio propuesto:**
  1. `/services/new` como formulario único:
     - cliente (buscar o crear en ventana, punto 7);
     - inyector de ese cliente (buscar o crear en ventana);
     - fecha de recepción;
     - tipo de servicio;
     - mediciones y notas;
     - accesorios con cantidades;
     - líneas de cobro (solo el Administrador, con el precio del tipo precargado).
  2. Un endpoint que cree todo **en una sola transacción** (servicio, líneas, accesorios con su
     movimiento de stock), para no dejar servicios a medias si algo falla.
  3. En el detalle: editar los datos de recepción (inyector, fecha) mientras no esté entregado.
- **Usos a revisar:** `receive_injector` (servicio de dominio), `add_service_accessory`,
  `ServiceAccessoryForm`, permisos del operario (crea clientes e inyectores: ya tiene `add_customers`
  y `add_injectors`).
- **Tests:** la creación completa es atómica (si un accesorio no tiene stock, no se crea nada); el
  operario puede recibir sin líneas de cobro; el Administrador recibe con líneas.
- **Migración:** no (usa los modelos de 1A y 1B).

### Punto 7. Crear lo que falta desde el mismo formulario (ventana)

- **Estado verificado:** no existe ningún componente de ventana (modal) en
  `frontend/src/components`. Los formularios que se reutilizarían ya son componentes con
  `onSubmit`/`onCancel`: `CustomerForm`, `InjectorForm`, `LocationForm`, `SupplierForm`,
  `ProductForm`.
- **Cambio propuesto:**
  1. Componente `Dialog` accesible: foco atrapado, Esc para cerrar, foco que vuelve al botón que la
     abrió (ver `confirmWithFocusRestore` y el bug de foco de Electron documentado en
     `infra/windows/electron/main.js`).
  2. Un solo nivel: dentro de una ventana no se abre otra.
  3. Lugares, cada uno solo si el usuario tiene permiso de crear eso:
     - recibir servicio → cliente e inyector (1C);
     - nuevo inyector → cliente;
     - nuevo o editar producto → ubicación;
     - nueva compra → proveedor;
     - línea de compra → producto;
     - producto de proveedor → producto.
  4. Al guardar en la ventana, el elemento nuevo queda elegido en el formulario de fondo.
- **Usos a revisar:** cada formulario reutilizado (que no dependa de estar en una página propia:
  `router`, `AppShell`, navegación al guardar).
- **Tests:** lint y build; prueba manual de foco y teclado, también en Electron.
- **Migración:** no.
- **Dudas:** PREGUNTAR si Ventas debe poder crear un cliente desde la venta o la proforma. Hoy
  solo puede buscarlos (decisión del punto 4 de la auditoría anterior), así que el botón no le
  aparecería.

### Punto 2 + 4. Orden de productos, orden y copias de etiquetas

- **Estado verificado:**
  - `ProductViewSet` (`apps/inventory/views/product.py`) **no acepta orden**: usa el
    `Meta.ordering = ["standard_code"]` del modelo y, al buscar, pone primero la coincidencia exacta
    de código. Postgres ordena el código de forma lexicográfica: "A10" antes que "A2".
  - La pantalla (`app/inventory/products/page.tsx`) no tiene control de orden.
  - Etiquetas: la pantalla manda los ids de la selección en el orden en que se marcaron
    (`Array.from(selectedProductIds)`, línea ~571) y `ProductViewSet.labels` **respeta ese orden**
    y **quita los repetidos** (`seen_ids`). Tope: `MAX_LABELS_PER_DOCUMENT = 200` productos.
  - Hay otro generador de etiquetas sin uso en la pantalla (`documents/product-labels/`,
    `build_product_labels_pdf`), que ordena por ubicación y código.
- **Cambio propuesto:**
  1. `ProductViewSet`: parámetro `ordering` con lista blanca:
     - código (natural);
     - nombre;
     - descripción;
     - ubicación;
     - existencia;
     - fecha de registro (`created_at`);
     - fecha de modificación (`updated_at`);
     - cada uno ascendente o descendente.
     Con búsqueda, la coincidencia exacta sigue primero.
  2. Orden natural del código: colación ICU numérica (`CreateCollation` de
     `django.contrib.postgres.operations` + `Collate` al ordenar).
  3. Pantalla: selector de orden y dirección; se recuerda en `localStorage` (con try/catch).
  4. Etiquetas: al imprimir se abre un panel con la lista de seleccionados, **la cantidad de copias
     de cada uno** (1 por defecto, con "poner la misma a todas") y **el orden** (propuesto: el de la
     lista). El endpoint recibe `items: [{product_id, copies}]` y `ordering`. Ordena el backend,
     porque la selección puede abarcar varias páginas. El tope de 200 pasa a contar etiquetas
     (copias), no productos.
- **Usos a revisar:** `getProducts` y su query (los usan los buscadores de venta, compra, servicio,
  proforma y movimientos: el orden nuevo no debe cambiar su comportamiento por defecto),
  `generateProductLabels`, tests de etiquetas.
- **Tests:** cada orden con su dirección; orden natural (A2 < A10); orden inválido → 400; copias
  generan N etiquetas; el tope cuenta copias; el orden de las etiquetas respeta el parámetro.
- **Migración:** sí, solo la colación (aditiva, no toca datos).

### Punto 6. Traslados a la otra sede

- **Estado verificado:**
  - No hay forma, ni en pantalla ni en la API, de sacar mercadería sin una venta: `adjust_stock`
    (`apps/inventory/services/stock.py`) solo lo usan los datos de demostración, y los conteos
    físicos generan `ADJUSTMENT`.
  - Tipos de movimiento actuales (`apps/inventory/models/catalog.py`): ENTRY, EXIT, ADJUSTMENT,
    INITIAL, REVERSAL, SERVICE_USE.
  - "Productos que más se mueven" (`most_moved_products_results`) excluye INITIAL y REVERSAL; un
    tipo nuevo contaría si no se excluye.
- **Cambio propuesto:**
  1. Catálogo `Branch` ("Sedes": nombre, activa).
  2. Documento `StockTransfer`:
     - sede, fecha, notas;
     - estado BORRADOR / CONFIRMADO / ANULADO;
     - auditoría, con su número visible.
     Más las líneas `StockTransferItem` (producto, cantidad). Mismo patrón que compra y venta:
     líneas inmutables, editables solo en borrador.
  3. Tipo de movimiento nuevo `TRANSFER_OUT` ("Traslado a sede") y FK
     `StockMovement.stock_transfer_item`. `clean()` exige esa FK, como pasa con ENTRY/EXIT.
  4. Confirmar: valida existencia suficiente de todas las líneas y crea las salidas. Anular un
     confirmado: crea las reversiones (vuelve el inventario). Anular un borrador: solo cambia el
     estado.
  5. Permisos: módulo nuevo `transfers` (`view_/add_/change_/cancel_transfers`). Ningún rol lo
     recibe: solo el Administrador, que tiene todo. Sube el total de permisos de 38 a 42.
  6. PDF "Guía de traslado": sede, fecha, número, productos y cantidades, y el recuadro de
     revisión. Sin costos.
  7. Movimientos: origen "Traslado #N" con enlace; el tipo en los filtros.
  8. "Productos que más se mueven": excluir `TRANSFER_OUT`.
  9. Menú: "Traslados" en Inventario, solo para el Administrador.
- **Usos a revisar:** `StockMovement.clean`, `movement_origin_label` (backend) y `origin.ts`
  (frontend), `STOCK_MOVEMENT_TYPE_OPTIONS`, `most_moved_products_results`, `StockMovementSerializer`,
  `ModulePermissions` + `apps/core/tests.py` (conteo y matriz), `permissions.ts`,
  `navigation-config.ts`, `PERMISSION_MODULES` de la pantalla de usuarios.
- **Tests:**
  - confirmar descuenta;
  - sin existencia suficiente no confirma nada;
  - anular un confirmado devuelve todo;
  - no se edita un confirmado;
  - solo el Administrador;
  - el ranking no lo cuenta;
  - el PDF sale.
- **Migración:** aditiva (modelos nuevos, FK nueva nullable en movimientos, choice nuevo, permisos
  nuevos). No toca datos existentes.

---

## 6. Checklist de avance (marcar al hacer commit)

- [x] 5 — "Debe haber al contar" grande y centrado, arriba, antes del desglose por método de pago (y arriba en el detalle, sin repetirse); "Total cobrado" centrado y con ese nombre en el formulario y el detalle
- [x] 1A — Tipo de servicio completo (precio de mano de obra solo visible para el Administrador,
      descripción larga, pantalla /services/types con acceso desde Servicios). El kit de accesorios
      se implementó y se **quitó** el 2026-10-23 a pedido de Alejandro: descontaba inventario por
      suposición (migración `customers/0014`).
- [x] 3 + 1B — Cobro por líneas; el precio ya no se acumula. Incluye: accesorios editables
      (cantidad, precio, notas) con el inventario ajustado (se revierte la salida vigente y se registra
      una nueva); quitar y anular devuelven solo la salida vigente; "Nuevo" tipo de servicio en
      ventana con el formulario completo (primer uso del `Dialog` del punto 7); factura con el
      detalle; aviso al entregar con total ₡0. `ServiceTypePriceHistory` dejó de escribirse y
      leerse; el modelo sigue (ver sección 7).
- [x] 2 + 4 — Orden de productos; orden y copias de etiquetas. La lista ordena con `?ordering=`
      (selector y clic en los encabezados; recuerda el último orden; colación ICU `lics_natural`,
      migración `inventory/0027`). "Generar etiquetas" abre una ventana con los seleccionados (aunque
      estén en otras páginas), el orden (propuesto: el de la lista) y las copias de cada uno. A
      diferencia de la propuesta, **ordena la pantalla** con el mismo criterio que el backend y manda
      `items` ya ordenados: así la ventana muestra exactamente el orden en que salen; el endpoint
      imprime en el orden recibido. `product_ids` (una copia de cada uno) se sigue aceptando.
- [x] 6 — Traslados a la otra sede. Inventario › Traslados (solo Administrador): borrador con
      líneas → confirmar (sale el inventario, `TRANSFER_OUT`) → anular con motivo (vuelve).
      Guía de traslado en PDF (sin costos, con columna "Recibido" para anotar). Sedes: se eligen y
      se crean desde el traslado ("Nueva", en ventana); se renombran o desactivan en el panel de
      administración; la migración deja creada "Otra sede". Movimientos muestran "Traslado #N" con
      enlace; "Productos que más se mueven" no los cuenta. Permisos: 38 → 42.
- [x] 7 — Crear desde el formulario (ventana). Botón "Nuevo" (solo con permiso de crear, `add_*`):
      producto → ubicación; compra → proveedor; línea de compra y producto de proveedor → producto
      (propone como código lo escrito en el buscador); venta, proforma e inyector → cliente. Los
      formularios de página tienen modo `embedded` (paneles internos, sin la casilla de activo). El
      `Dialog` se monta en `<body>` y no deja subir el submit (la proforma del listado de productos
      tiene el buscador de cliente dentro de su formulario); Ctrl+S solo guarda el formulario de la
      ventana abierta (`isFormShortcutTarget`). **Ventas puede crear clientes** (`add_customers`, sin
      editar), decisión del 2026-10-25. La recepción del servicio (cliente e inyector) va en el 1C.
      Ajustes tras revisarlo con Alejandro: sin resultados, la lista ofrece "Crear … «lo buscado»"
      (`SearchNoResults`), y es **la única forma en los buscadores** (se quitó el botón "Nuevo" de
      al lado: obliga a buscar antes y evita duplicados; la ayuda del campo lo dice). Los selectores
      (ubicación, sede, tipo de servicio) conservan su botón "Nueva/Nuevo". La ventana abre con lo escrito (nombre del cliente o proveedor; en
      producto, una palabra va como código y con espacios como nombre); cerrar con Esc o la × pregunta
      si hay cambios; la ventana de producto muestra solo código, nombre y ubicación, y el resto en
      "Más datos" (se abre sola si alguno trae un error).
- [ ] 1C — Formulario completo de recepción del servicio

---

## 7. Dudas pendientes ("PREGUNTAR")

Consultar cada una al empezar su punto:

1. (5) ¿Unificar "Total esperado" del formulario y "Cobrado" del detalle como "Total cobrado"?
2. (3 + 1B) ¿Borrar `ServiceTypePriceHistory`? Desde el 3 + 1B ya no se escribe ni se lee (sus
   datos eran totales con accesorios); el modelo, su tabla y su endpoint de solo lectura siguen.
   Borrarlo es una migración destructiva aparte: decidir antes de liberar la 2.5.0.
3. (7) ¿Ventas puede crear un cliente desde la venta o la proforma? **Sí** (2026-10-25): el rol
   Ventas recibe `add_customers`, sin `change_customers`.
