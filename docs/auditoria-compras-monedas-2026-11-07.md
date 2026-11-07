> **Estado (2026-11-07): implementado, pendiente de que Alejandro corra tests, lint, build y la
> migración.** Lo hecho está en `CHANGELOG.md` ([No liberado]). Respuestas de Alejandro: P1 todo en
> colones; P2 confirmar es definitivo (un costo tardío obliga a anular y reingresar); P7 precio a
> dos decimales; P9 corregir lo que haya en dólares mal. El resto se resolvió con la recomendación
> de la tabla de la sección 7, salvo:
> - **P8 dejó de existir:** el tipo de cambio de un costo pasó a depender solo de la moneda del
>   costo (₡ por US$1 con que se pagó; 1 en colones), así que cambiar la moneda de la compra no
>   deja costos incoherentes.
> - **Calcular costos en una compra confirmada sí se permite** (solo cambia el margen; líneas y
>   costos quedan fijos). En una anulada no.
> - **Correcciones a la sección 3:** B10 era falso (`Supplier` no tiene moneda; la de
>   `seed_demo_data` se descarta), se usa la moneda de la última compra del proveedor. En B8, el
>   bloque del producto ya filtraba compras confirmadas; lo que no coincidía era el orden, que
>   ahora es el mismo del precio vigente. Bug nuevo encontrado: el formulario del producto
>   (`product-form.tsx`) volvía a convertir el sugerido a colones.
> - **P9:** la migración no puede adivinar un tipo de cambio que se guardó como 1; para eso está
>   `manage.py fix_purchase_exchange_rate` (lista, muestra el cambio y lo aplica con `--apply`).

# Auditoría y plan de trabajo: compras en dólares, compras mixtas y precio de venta (2026-11-07)

> **Qué es este archivo.** Es el prompt y el material de apoyo para dejar bien el módulo de
> compras cuando intervienen dólares: compras en USD, compras en CRC con costos en USD, compras en
> USD con costos en CRC, y el cálculo de costo final y precio de venta que sale de todo eso. Nace
> del reporte del cliente: *"al hacer compras con dólares o mixtas se hace un desorden, no aparecen
> los precios bien, la compra en dólares y sus costos en colones no transfieren bien al tipo de
> cambio"*.
>
> Todo lo que dice aquí se verificó leyendo el código real en el commit `c9690dc` (versión 2.5.0),
> rama `main`. **No se cambió ningún archivo de código durante la auditoría.** Antes de tocar cada
> fase hay que volver a leer los archivos: el código puede haber cambiado desde esa fecha.

---

## 0. PROMPT PARA EL CHAT QUE VA A IMPLEMENTAR

Copie desde aquí hasta el final de la sección 0 como primer mensaje del chat nuevo, y adjunte este
archivo completo.

> Vas a revisar a fondo y corregir el módulo de compras del sistema LICS (backend Django REST en
> `backend/src`, frontend Next.js/TypeScript en `frontend/src`) en todo lo que tiene que ver con
> monedas, tipo de cambio, costos adicionales, costo final y precio de venta sugerido. El cliente
> reporta que con compras en dólares o mixtas (dólares + colones) los precios salen mal en todos
> lados. La auditoría de `docs/auditoria-compras-monedas-2026-11-07.md` ya encontró bugs concretos
> (sección 3), propone un modelo de cálculo único (sección 4), lista las decisiones que necesito
> tomar (sección 7) y trae una matriz de casos que tienen que funcionar todos (sección 5).
> Reglas obligatorias:
>
> 1. **No deduzcas ni inventes nada.** Antes de cambiar algo, lee el código real de todos los
>    archivos que menciona la auditoría y confirma que lo que dice sigue siendo cierto. Si algo no
>    coincide, detente y avísame.
> 2. **La auditoría no es exhaustiva: recorre el módulo completo tú mismo.** Lee de punta a punta
>    los modelos, serializers, servicios, selectors y vistas de compras y costos, los reportes que
>    usan montos de compras, y todas las pantallas del frontend que muestran o editan montos de
>    compra, costos o precio. Todo bug nuevo que encuentres lo agregas a la sección 3 con archivo,
>    línea, causa y caso que lo reproduce, antes de corregirlo.
> 3. **Primero reproduce, después corrige.** Para cada bug escribe primero el test que falla
>    (con números concretos de la matriz de la sección 5), y luego el arreglo. Los montos esperados
>    de los tests se calculan a mano en el propio test o en un comentario, no copiando lo que
>    devuelve el código.
> 4. **Si el cambio toca una función, un serializer, un tipo o un componente, busca TODOS los
>    lugares donde se usa** (`grep` en backend y frontend) y revisa que no rompa ninguno. En tu
>    propuesta enumera los usos que encontraste.
> 5. **Antes de empezar, hazme las preguntas de la sección 7** (tienen una recomendación cada una).
>    No arranques la fase 2 sin mis respuestas.
> 6. **Tú editas los archivos; yo corro todos los comandos** (migraciones, tests, lint, build y
>    todo git). Dame cada comando en su propio bloque `bash`, empezando con
>    `cd ~/VisualStudioCode/laboratorio-inyeccion-castro-solis &&` para que funcione desde donde
>    esté mi terminal. Tests de backend siempre con `--buffer`. Nunca corras comandos de shell que
>    cambien cosas, ni para "confirmar que funcionan".
> 7. **Cada migración me la explicas antes de que la corra:** qué hace, si es aditiva,
>    compatible o destructiva, y qué pasa con los datos existentes (compras y cálculos de costo
>    ya guardados en la base del cliente).
> 8. **Una fase a la vez** (sección 6), con cambios quirúrgicos. No reformatees ni "mejores"
>    código fuera del alcance. Al cerrar cada fase: tests verdes, `lint` y `build` del frontend,
>    marcar la sección 8 y sugerirme un commit corto con `git commit -m "tipo: resumen"`.
> 9. **Respeta las reglas visuales del sistema** (`docs/frontend-design-system.md`): colones como
>    `₡`, montos alineados a la derecha en `font-mono`, textos neutros (no imperativos), escala de
>    radios con `var(--radius-*)`.
> 10. **Al final**, haz un recorrido completo de punta a punta con los casos de la sección 5
>     (crear compra → líneas → costos → resumen → aplicar costos → confirmar → ver precio en el
>     producto, en ventas, en proforma, en etiquetas y en reportes), dime qué verificaste y qué no,
>     y agrega lo arreglado al `CHANGELOG.md` en una sección nueva.
>
> Empieza leyendo la auditoría completa, luego el código de la sección 2, y respóndeme con: (a) qué
> de la sección 3 confirmaste y qué no, (b) bugs nuevos que hayas encontrado, (c) las preguntas de
> la sección 7.

---

## 1. Contexto del sistema

### 1.1. Comandos (los corre Alejandro)

- Tests backend: `make test` (ya incluye `--buffer`), o puntuales con
  `docker compose ... exec backend python manage.py test apps.inventory.tests.test_cost_services --buffer`
  (ver `Makefile` para la forma exacta).
- Frontend: `npm run lint` y `npm run build` dentro de `frontend/`.
- Migraciones: `make makemigrations` / `make migrate` (ver `Makefile`).

### 1.2. Convención de tipo de cambio (vigente, conservarla)

**Todo `exchange_rate` del sistema es colones por dólar (₡ por US$1)**, sin importar la moneda del
documento. Así lo documentan `_convert_import_cost_to_purchase_currency`
(`backend/src/apps/inventory/services/costs.py:21`) y `_convert_purchase_amount_to_crc`
(`backend/src/apps/core/views/reports.py:280`). En una compra o costo en colones el tipo de cambio
"no aplica" y se guarda `1`. **El precio de venta (`custom_sale_price`, `effective_sale_price`) es
siempre en colones.**

---

## 2. Mapa del módulo (archivos que hay que leer completos)

Backend (`backend/src/apps/inventory/`):

| Archivo | Qué tiene |
|---|---|
| `models/catalog.py` | `Currency` (CRC, USD) |
| `models/purchase.py` | `Purchase` (`currency`, `exchange_rate` default 1), `PurchaseItem` (`unit_cost` en moneda de la compra) |
| `models/costs.py` | `ImportCost` (`amount`, `currency`, `exchange_rate` propio), `ProductCostHistory` (`original_unit_cost`, `cost_factor`, `final_unit_cost`, `suggested_price` **en moneda de la compra**, `currency`, `exchange_rate` copiado de la compra) |
| `models/supplier.py` | `Supplier.currency` (moneda habitual del proveedor; hoy no se usa en el formulario de compra) |
| `serializers/purchase.py` | `PurchaseSerializer` (sin validación de `exchange_rate`), `PurchaseItemSerializer` |
| `serializers/costs.py` | `ImportCostSerializer` (valida 1 / ≠1 contra la moneda de la compra), `ProductCostHistorySerializer` |
| `services/costs.py` | `_convert_import_cost_to_purchase_currency`, `_calculate_item_cost`, `purchase_cost_summary`, `calculate_purchase_costs`, `discard_purchase_cost_calculation` |
| `services/purchases.py` | `confirm_purchase`, `cancel_purchase` |
| `selectors/pricing.py` | `_cost_history_with_suggested_price_in_crc`, `latest_suggested_price`, `with_latest_suggested_price`, `effective_sale_price` |
| `views/purchase.py` | `PurchaseViewSet` (`calculate-costs`, `cost-summary`, `confirm`, `cancel`), `PurchaseItemViewSet` |
| `views/costs.py` | `ImportCostViewSet`, `ProductCostHistoryViewSet` |
| `../core/views/reports.py` | `_convert_purchase_amount_to_crc`, reportes de compras por proveedor y comparación de precios por producto |
| `../core/views/report_pdfs.py` | PDFs de esos reportes |
| `../core/management/commands/seed_demo_data.py` | compras demo (proveedores en USD) |
| `serializers/product.py` | `latest_suggested_price` / `effective_sale_price` del producto |

Frontend (`frontend/src/`):

| Archivo | Qué tiene |
|---|---|
| `features/inventory/purchases/types.ts` | `emptyPurchaseFormValues` (CRC, tipo de cambio `"1"`) |
| `features/inventory/purchases/purchase-form.tsx` | selector de moneda y tipo de cambio (l. 447-495) |
| `features/inventory/purchases/validation.ts` | validación de la compra (solo `> 0`) |
| `features/inventory/purchases/import-cost-form.tsx`, `import-cost-validation.ts` | costo adicional, moneda y tipo de cambio propio |
| `features/inventory/purchases/purchase-costs-section.tsx` | lista de costos, resumen con margen, aplicar costos, histórico (`MoneyWithEquivalent`) |
| `features/inventory/purchases/format.ts` | `formatMoney`, `crcEquivalent` (devuelve `"≈ X CRC"`) |
| `app/inventory/purchases/page.tsx` | lista de compras con total y equivalente |
| `app/inventory/purchases/[id]/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx` | detalle, alta y edición |
| `app/inventory/products/[id]/page.tsx` | bloque "Costos y precio" (l. ~1020-1170) |
| `app/inventory/products/page.tsx`, `features/inventory/products/*` | precio en la lista y en el formulario del producto |
| `features/sales/sale-item-form.tsx`, `app/sales/proforma/page.tsx` | toman `effective_sale_price` |
| `app/reports/purchases-by-supplier/page.tsx` | reporte |

Tests existentes a extender: `inventory/tests/test_cost_services.py`, `test_import_cost_api.py`,
`test_purchase_api.py`, `test_purchase_services.py`, `test_document_integrity.py`,
`core/tests.py` (reportes, l. ~1900 y ~2285 tienen casos USD).

---

## 3. Bugs confirmados en la auditoría

Ordenados por impacto. "Caso" usa los IDs de la matriz de la sección 5.

### B1. Compra en USD que queda con tipo de cambio 1 (el más probable detrás del reporte)

- **Dónde:** `types.ts:91-92` (formulario nuevo arranca en CRC con `"1"`), `purchase-form.tsx:457-463`
  (al cambiar a USD **no se limpia el `"1"`**, solo se pone `"1"` al volver a CRC),
  `validation.ts` (solo exige `> 0`), `PurchaseSerializer` (no valida `exchange_rate` en absoluto).
- **Efecto:** el usuario cambia la moneda a USD y si no toca el tipo de cambio la compra se guarda
  con `1`. Entonces `selectors/pricing.py` convierte el sugerido USD a colones multiplicando por 1:
  un producto de US$10 queda con precio de venta **₡10**. Los equivalentes en colones del detalle,
  la lista y los reportes también salen ×1.
- **Caso:** U1 con tipo de cambio sin tocar.
- **Arreglo esperado:** al cambiar a USD vaciar el campo (o prellenar con el último tipo de cambio
  usado, ver P3); validar en frontend **y** backend que USD exige un tipo de cambio razonable
  (≠ 1, dentro de un rango, ver P4) y que CRC exige exactamente 1 (el backend hoy acepta una
  compra CRC con 520).

### B2. Cambiar moneda o tipo de cambio de un borrador no invalida nada

- **Dónde:** `PurchaseViewSet.perform_update` (`views/purchase.py:144`) no llama a
  `discard_purchase_cost_calculation`; `PurchaseSerializer.validate` (`serializers/purchase.py:213`)
  no revisa los costos adicionales.
- **Efecto 1:** el cálculo guardado copió el `exchange_rate` y la `currency` viejos; si después se
  corrige el tipo de cambio (justo lo que haría el usuario al ver el ₡10 de B1), el precio sigue
  saliendo del cálculo viejo hasta recalcular.
- **Efecto 2:** al pasar una compra de CRC a USD, un costo adicional en USD que tenía tipo de cambio
  real (p. ej. 520) ahora está en la misma moneda que la compra y debería ser 1; uno en CRC que
  tenía 1 ahora debería tener tipo de cambio real. Quedan costos incoherentes que
  `ImportCostSerializer.validate` rechazaría si se crearan hoy, y el cálculo los convierte mal
  (un costo CRC de ₡50 000 con tipo de cambio 1 en compra USD suma **US$50 000**).
- **Casos:** M5, M6.

### B3. Cada tipo de cambio va por su lado (costos vs. compra)

- **Dónde:** `_convert_import_cost_to_purchase_currency` usa el `exchange_rate` **del costo**;
  `selectors/pricing.py` convierte el sugerido con el `exchange_rate` **de la compra**.
- **Efecto:** en una compra USD (TC 520) con flete en colones (TC del costo 505), el flete se pasa a
  dólares con 505 y el resultado se pasa a colones con 520: el flete termina valiendo más colones de
  los que se pagaron. En una compra CRC con costo en USD, el costo usa su propio TC, que es lo
  correcto, pero en la pantalla se mezclan dos TC sin decir cuál se usó para qué.
- **Casos:** M1, M2, M3.
- Ver la propuesta de la sección 4: calcular todo en colones, convirtiendo cada monto con el TC de
  su propio documento.

### B4. Recalcular costos duplica el histórico

- **Dónde:** `calculate_purchase_costs` (`services/costs.py:172`) crea filas nuevas sin borrar las
  anteriores de esa compra.
- **Efecto:** cada "Aplicar costos" agrega N filas más; el histórico de la compra y del producto
  muestra cálculos repetidos (con márgenes distintos), y cuál rige depende de `calculated_at`.
- **Arreglo esperado:** en borrador, descartar el cálculo previo antes de crear el nuevo
  (en la misma transacción y con la compra bloqueada con `lock_draft_purchase`).

### B5. Se puede calcular costos y agregar/editar costos adicionales en compras confirmadas o anuladas

- **Dónde:** `calculate_costs` (`views/purchase.py:251`) no revisa el estado;
  `ImportCostViewSet.perform_create/perform_update/perform_destroy` (`views/costs.py:96`) no
  revisan el estado ni bloquean la compra, y `discard_purchase_cost_calculation` no hace nada fuera
  de borrador.
- **Efecto:** en una compra confirmada se agrega un costo y el cálculo vigente ya no corresponde a
  los costos guardados; o se recalcula una compra confirmada/anulada y aparecen filas nuevas. En una
  anulada no afecta el precio (el selector filtra CONFIRMED) pero ensucia el histórico.
- **Pregunta P2:** ¿se permite agregar costos (p. ej. el flete que llega después) a una compra ya
  confirmada? Según la respuesta: bloquear todo fuera de borrador, o permitirlo solo en confirmada
  y recalcular reemplazando el cálculo de esa compra.

### B6. Qué cálculo rige el precio depende de cuándo se calculó, no de cuándo entró la mercadería

- **Dónde:** `selectors/pricing.py`, orden `-calculated_at, -id`.
- **Efecto:** compra A calculada el lunes, compra B calculada el martes, A confirmada el miércoles:
  el precio sale de B aunque A sea la última que entró. Combinado con B4/B5 esto vuelve el precio
  impredecible.
- **Arreglo esperado:** ordenar por la compra (`purchase__confirmed_at` o `purchase__purchase_date`,
  ver P5) y desempatar por `calculated_at`/`id`.

### B7. Confirmar sin haber aplicado costos

- **Dónde:** `confirm_purchase` no mira si hay cálculo.
- **Efecto:** la mercadería entra y el producto sigue con el precio de la compra anterior (o sin
  precio) sin que nadie se entere. **Pregunta P6:** ¿avisar, exigir el cálculo, o calcular solo al
  confirmar con el margen por defecto?

### B8. Equivalentes y textos de moneda inconsistentes en pantalla

- `crcEquivalent` (`format.ts`) devuelve `"≈ 1 234 CRC"`; la regla del sistema es `₡`.
- `purchase-costs-section.tsx:574-581` muestra el equivalente de un costo USD con el TC de la compra
  si la compra es USD y con el del costo si no: el usuario no sabe cuál se usó. Un costo en CRC en
  una compra USD no muestra a cuántos dólares equivale, que es justo lo que suma al cálculo.
- El resumen (`cost-summary`) solo da los montos en la moneda de la compra + un equivalente; no
  hay un desglose claro "precio de venta en colones" que es lo único que le importa al usuario
  para vender.
- Lista de compras (`app/inventory/purchases/page.tsx:83-92`): el total es solo el subtotal de
  líneas (sin costos adicionales) y no lo dice.
- Producto (`app/inventory/products/[id]/page.tsx:1120-1170`): muestra el "último precio de costo"
  del último cálculo de **cualquier** compra (`getLatestProductCostHistory`), que puede ser un
  borrador, mientras el precio de venta sale solo de compras confirmadas: costo y precio pueden
  venir de compras distintas. Verificar qué filtro usa la llamada.

### B9. Redondeos

- `final_unit_cost` y `suggested_price` se redondean a 4 decimales **en la moneda de la compra** y
  luego se multiplican por el TC en SQL (`Cast` a 4 decimales). Para USD, 4 decimales de dólar es
  suficiente, pero el precio en colones que ve el usuario es un número con decimales raros
  (₡5 234,4316). **Pregunta P7:** ¿a cuánto se redondea el precio de venta en colones (₡1, ₡5,
  ₡10, ₡50, ₡100)?
- `cost_factor` se guarda con 6 decimales pero se usa sin redondear en el resumen: el resumen y lo
  guardado pueden diferir en el último decimal.

### B10. La moneda del proveedor no se usa

- `Supplier.currency` existe (los proveedores demo son USD) pero el formulario de compra siempre
  arranca en CRC. Elegir el proveedor debería prellenar la moneda (y, si es USD, el TC, ver P3).

---

## 4. Modelo de cálculo propuesto (validar con Alejandro, pregunta P1)

**Hoy:** todo se calcula en la moneda de la compra, cada costo adicional se pasa a esa moneda con su
propio TC, y al final el sugerido se pasa a colones con el TC de la compra.

**Propuesta: calcular en colones, que es la moneda en que se vende.**

```
Para cada línea:
    costo_linea_crc = unit_cost × quantity × TC_compra        (TC_compra = 1 si la compra es CRC)

Para cada costo adicional activo:
    costo_extra_crc = amount × TC_costo                       (TC_costo = 1 si el costo es CRC)

subtotal_crc   = Σ costo_linea_crc
extras_crc     = Σ costo_extra_crc
factor         = (subtotal_crc + extras_crc) / subtotal_crc

Por línea:
    costo_final_unitario_crc = unit_cost × TC_compra × factor
    precio_sugerido_crc      = redondeo_P7( costo_final_unitario_crc × (1 + margen/100) )
```

- Cada monto se convierte **una sola vez**, con el TC del documento donde se pagó. Nunca se pasa un
  monto de colones a dólares para luego volverlo a colones.
- El costo en moneda original se sigue guardando y mostrando (`original_unit_cost` + `currency` +
  `exchange_rate`), pero `final_unit_cost` y `suggested_price` pasan a ser en colones. Eso implica
  una migración en `ProductCostHistory` (o campos nuevos `*_crc`); el chat que implemente debe
  proponer las dos alternativas, explicar qué pasa con las filas ya guardadas en la base del
  cliente (convertirlas con el `exchange_rate` que ya tienen copiado) y simplificar
  `selectors/pricing.py` para que ya no convierta.
- El resumen del frontend muestra, por línea: costo original (moneda de la compra) · costo en ₡ ·
  parte de costos adicionales en ₡ · costo final ₡ · precio sugerido ₡; y arriba: subtotal, cada
  costo adicional con su moneda, su TC y su equivalente ₡, factor y total.
- Si Alejandro prefiere mantener el cálculo en la moneda de la compra, la alternativa mínima es:
  convertir los costos adicionales con el TC de la compra (no el propio) o mostrar claramente ambos,
  y dejar la conversión final como está. La recomendación es la propuesta en colones.

---

## 5. Matriz de casos que tienen que funcionar (tests + recorrido final)

TC de referencia: compra 520, costos 515 cuando sean distintos (para detectar mezclas). Margen 30 %.
Cada caso se prueba en: resumen (`cost-summary`), aplicar costos (`calculate-costs`), precio del
producto tras confirmar (`effective_sale_price`), detalle del producto, venta/proforma, reportes.

| ID | Compra | Líneas | Costos adicionales | Qué verificar |
|---|---|---|---|---|
| C1 | CRC | 2 líneas en ₡ | ninguno | factor 1; sugerido = costo × 1,30 en ₡ |
| C2 | CRC | 2 líneas | 1 costo en ₡ | prorrateo proporcional al subtotal de cada línea |
| U1 | USD, TC 520 | 2 líneas en $ | ninguno | precio en ₡ = $ × 520 × 1,30; **nunca** ×1 |
| U2 | USD, TC 520 | 2 líneas | 1 costo en $ (TC 1) | costo usa 520 al llevarlo a ₡ |
| M1 | USD, TC 520 | 2 líneas | 1 costo en ₡ (flete local, TC 515) | el flete suma exactamente los ₡ pagados, no ₡×520/515 |
| M2 | CRC | 2 líneas | 1 costo en $ (TC 515) | el costo suma $ × 515 |
| M3 | USD, TC 520 | 3 líneas | 1 en $, 1 en ₡, 1 en ₡ inactivo | inactivo no cuenta; mezcla correcta |
| M4 | CRC | 1 línea | 2 costos en $ con TC distintos (510 y 520) | cada uno con su TC |
| M5 | borrador CRC con costo $ (TC 515) → se cambia a USD | — | — | el costo $ queda incoherente: el sistema lo detecta (corrige a TC 1, o bloquea el cambio y avisa, ver P8) y descarta el cálculo |
| M6 | borrador USD con costo ₡ (TC 1) → se cambia a CRC | — | — | ídem al revés |
| E1 | USD | cambio de TC 520 → 530 en borrador ya calculado | — | cálculo descartado; recalcular da el nuevo precio |
| E2 | cualquiera | recalcular 3 veces con márgenes distintos | — | una sola fila por producto y compra; rige el último margen |
| E3 | dos compras del mismo producto, una USD y otra CRC | calcular en orden distinto al de confirmación | — | rige la regla de P5 |
| E4 | compra confirmada con cálculo → se anula | — | — | producto vuelve al precio de la compra confirmada anterior, o queda sin sugerido |
| E5 | compra confirmada → se agrega costo adicional | — | — | según P2: rechazado (400 claro) o recalcula reemplazando |
| E6 | producto con `custom_sale_price` | compra USD calculada | — | el precio manual sigue mandando; el sugerido se ve como referencia en ₡ |
| E7 | margen 0 % y margen con decimales (12,5 %) | — | — | sugerido = costo final; redondeo P7 |
| E8 | montos pequeños: $0,15 × 1000 u. con TC 600 | — | costo ₡3 500 | sin pérdida por redondeo intermedio; la suma de partes cuadra con el total ±₡1 |
| E9 | TC con 4 decimales (519,8750) | — | — | se acepta y se usa tal cual |
| E10 | compra USD con TC 1, 0, vacío, negativo, 99 999 | — | — | rechazada en frontend y backend con mensaje neutro |
| E11 | compra CRC con TC ≠ 1 por API | — | — | rechazada (o normalizada a 1, ver P4) |
| E12 | proveedor con moneda USD | formulario nuevo | — | la compra se prellena en USD (P3) |
| E13 | borrador calculado → se borra una línea | — | — | cálculo descartado (ya existe, mantener test) |
| E14 | datos ya guardados en la base del cliente (cálculos viejos en USD) | — | — | tras la migración el precio en ₡ de cada producto es el mismo que antes (o el corregido si tenía TC 1, ver P9) |
| R1 | reporte compras por proveedor con compras CRC y USD | — | con costos | totales en ₡ correctos; decidir si incluye costos adicionales |
| R2 | reporte comparación de precios por producto, proveedores en monedas distintas | — | — | costo unitario en ₡ comparable |

---

## 6. Plan por fases

1. **Fase 0 – Recorrido y confirmación (sin cambios).** Leer todo lo de la sección 2, confirmar o
   descartar B1-B10, agregar bugs nuevos, hacer las preguntas de la sección 7. Escribir los tests
   de la matriz que fallan hoy (sin marcarlos como "fallo esperado": deben fallar de verdad y
   pasar al cerrar la fase que los arregla).
2. **Fase 1 – Validación del tipo de cambio (B1, B10, E10-E12).** Frontend: al cambiar moneda,
   limpiar/prellenar TC; moneda por defecto según proveedor; validación ≠ 1 y rango. Backend:
   `PurchaseSerializer.validate` con las mismas reglas (CRC = 1, USD con rango). Sin migración.
3. **Fase 2 – Integridad del cálculo (B2, B4, B5, B6, B7, M5, M6, E1-E5, E13).** Descartar cálculo al
   cambiar moneda/TC; coherencia de costos adicionales al cambiar la moneda de la compra; recalcular
   reemplaza; bloqueos por estado con `lock_draft_purchase`; orden del precio vigente; regla al
   confirmar sin cálculo. Sin migración salvo que P5 lo requiera.
4. **Fase 3 – Modelo de cálculo en colones (B3, B9, sección 4, C1-M4, E6-E9, E14).** Servicio
   `costs.py` reescrito con conversión única; migración de `ProductCostHistory` explicada antes de
   correrla, con migración de datos para los cálculos existentes; `selectors/pricing.py`
   simplificado; serializers con los campos nuevos.
5. **Fase 4 – Pantallas (B8).** Resumen y desglose en ₡ por línea, costos adicionales con su TC y
   equivalente, `crcEquivalent` con `₡`, total de la lista aclarado, bloque "Costos y precio" del
   producto coherente con el cálculo vigente. Ventas, proforma y etiquetas solo se verifican
   (toman `effective_sale_price`).
6. **Fase 5 – Reportes (R1, R2) y datos demo.** Revisar `reports.py` / `report_pdfs.py` contra el
   modelo nuevo; actualizar `seed_demo_data` para que las compras demo cubran USD, CRC y mixtas con
   costos.
7. **Fase 6 – Recorrido final** con toda la matriz en la app (frontend real, no solo API), informe
   de lo verificado y lo no verificado, `CHANGELOG.md`.

---

## 7. Dudas para Alejandro ("PREGUNTAR")

| # | Pregunta | Recomendación |
|---|---|---|
| P1 | ¿Se calcula el costo final y el precio en colones (sección 4) o se sigue calculando en la moneda de la compra? | Colones: es la moneda en que se vende y elimina el doble TC. |
| P2 | ¿Se pueden agregar costos adicionales a una compra ya confirmada (flete que llega después)? | Sí, solo en confirmada (no anulada), y al guardarlos se recalcula reemplazando el cálculo de esa compra con el mismo margen. |
| P3 | Al elegir USD, ¿el TC se prellena con el de la última compra en USD o queda vacío? | Prellenar con el último usado y mostrarlo resaltado para que se revise. |
| P4 | ¿Rango válido del TC en USD? ¿Una compra CRC con TC ≠ 1 se rechaza o se normaliza a 1? | Rango 100-2000 (configurable después si hace falta); CRC se normaliza a 1 en el backend. |
| P5 | ¿Qué compra define el precio vigente: la última confirmada (fecha de confirmación) o la de fecha de factura más reciente? | La última confirmada. |
| P6 | ¿Qué pasa al confirmar una compra sin costos aplicados? | Avisar en el diálogo de confirmación ("Esta compra no tiene costos aplicados; el precio de venta de sus productos no cambia") y permitir seguir. |
| P7 | ¿A cuánto se redondea el precio sugerido en colones? | Al ₡5 o ₡10 superior, según cómo cobra el cliente. |
| P8 | Al cambiar la moneda de un borrador con costos adicionales, ¿se corrigen solos o se bloquea el cambio? | Bloquear el cambio con un mensaje que diga qué costos hay que revisar; es más seguro que adivinar el TC. |
| P9 | Cálculos viejos guardados con TC 1 en compras USD (si existen en la base del cliente): ¿se corrigen en la migración o se dejan? | Detectarlos con una consulta antes de migrar, mostrárselos a Alejandro y decidir caso por caso. |
| P10 | ¿El reporte de compras por proveedor debe incluir los costos adicionales en el total? | Mostrar ambos: subtotal de factura y total con costos. |

---

## 8. Checklist de avance (marcar al hacer commit)

- [x] Fase 0: auditoría confirmada, bugs nuevos agregados, preguntas respondidas, tests escritos
  (`test_cost_services.py` con la matriz, `test_purchase_currency_api.py`, ajustes en
  `test_import_cost_api.py`, `test_purchase_api.py`, `test_product_api.py`, `test_sale_api.py`,
  `core/tests.py`)
- [x] Fase 1: validación del tipo de cambio y moneda propuesta por proveedor
- [x] Fase 2: integridad del cálculo (descartes, reemplazo, estados, orden del precio vigente)
- [x] Fase 3: modelo de cálculo en colones + migración `0030_costs_in_colones` + comando
  `fix_purchase_exchange_rate` (falta correr la migración)
- [x] Fase 4: pantallas de compra, costos y producto
- [x] Fase 5: reportes y datos demo
- [ ] Fase 6: recorrido final en la app (no hecho: los comandos los corre Alejandro) — CHANGELOG sí
