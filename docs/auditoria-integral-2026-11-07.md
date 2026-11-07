# Auditoría integral de LICS antes de producción (2026-11-07)

Objetivo: recorrer el sistema completo, backend y frontend, con todas las combinaciones y casos
límite que importan para operar, y dejarlo listo para producción. Cada bug se corrige con su test.

Estado: **plan escrito, pendiente de aprobación de Alejandro.** El recorrido en la app (fase 3)
no empieza hasta que Alejandro apruebe este plan y responda las decisiones de la sección 6.

Base del análisis: `main` en 7c0f283 (compras en dólares/mixtas y caja con sobregiro incluidas, sin
push). Las compras ya tuvieron su propia auditoría hoy (`docs/auditoria-compras-monedas-2026-11-07.md`,
matriz de 144 cálculos y 79 casos de mal uso). Aquí se vuelven a recorrer de punta a punta en la
pantalla, que es la parte que esa auditoría dejó sin hacer (fase 6).

---

## 1. Reglas del recorrido

- App en http://localhost. Usuarios del seed (`backend/src/apps/core/management/commands/seed_demo_data.py`):
  `demo.admin` (ADMIN), `demo.inventario` (INVENTORY), `demo.ventas` (SALES), `demo.servicios`
  (CUSTOMERS), `demo.lectura` (READ_ONLY). Contraseña común en `DEMO_PASSWORD` del seed.
- La sesión vive en memoria: se navega con los enlaces de la app, nunca recargando la página. Para
  cambiar de usuario: cerrar sesión y entrar de nuevo.
- Todo lo que se crea en el recorrido lleva el prefijo **`QA-IA`** (en notas, motivos, códigos,
  nombres) para distinguirlo de los datos demo y de los `QA-*` de la auditoría de compras.
- **Cierre de caja: no se puede editar ni borrar.** Antes de crearlo se le avisa a Alejandro con la
  semana y los montos, y se espera su "sí".
- Las compras/ventas/servicios que deben entrar en el cierre llevan fecha de la **semana del 31 de
  octubre al 6 de noviembre de 2026** (hoy, sábado 7, es el primer día de la semana siguiente, que
  todavía no se puede cerrar).
- Cada hallazgo se anota en la sección 7 con: id, pantalla/endpoint, pasos, resultado esperado vs.
  obtenido, severidad (Alta = dinero o inventario mal; Media = flujo roto o confuso; Baja = estética
  o texto) y estado.
- Los bugs se corrigen con test (backend `manage.py test --buffer`, frontend lint + build). Alejandro
  corre los comandos. Si una corrección necesita migración, se explica antes.
- Después de `npm run build` en el host: `docker compose -f infra/docker/compose.yml restart frontend`.

## 2. Criterios de "funciona" e "intuitivo"

Un caso **funciona** si:

1. El resultado en pantalla es el mismo que devuelve la API y el mismo que sale en el PDF/reporte.
2. El dinero cuadra al céntimo: subtotal − descuento + impuesto = total (redondeo 2 decimales,
   `ROUND_HALF_UP`, `apps/core/money.py`), y la caja suma exactamente esos totales congelados.
3. El inventario cuadra: existencia = Σ entradas − Σ salidas de `StockMovement`; cada anulación
   devuelve exactamente lo que salió; nada queda en negativo.
4. Las transiciones prohibidas se rechazan con un mensaje claro (400), sin error 500, sin efectos a
   medias (todo o nada).
5. Cada rol ve y puede hacer solo lo que le corresponde, en el menú, por URL directa y por API (403).

Un caso es **intuitivo** si (reglas de `docs/frontend-design-system.md` y de la memoria del proyecto):

1. Se llega desde el menú en ≤ 2 clics y el siguiente paso obvio está a la vista (botón primario).
2. Textos neutros ("X es obligatorio.", "Búsqueda por …"), botones en infinitivo.
3. Colones como `₡`, montos y cantidades alineados a la derecha en `font-mono`, negativos como
   `−₡2 500` (signo antes del símbolo), fechas con `formatDateOnly`/`formatDate`/`formatWeekRange`.
4. Radios con `var(--radius-*)` según el nivel de anidamiento; insignias de estado `px-3 py-1.5`.
5. Formularios: Ctrl+S guarda, "Hay cambios sin guardar…" al cancelar/Esc/×; búsqueda con
   "+ Crear … «lo buscado»" solo en sin-resultados; selects con "+ Nueva …" al final.
6. Acciones irreversibles (confirmar, anular, cerrar caja) piden confirmación y explican la
   consecuencia; estados vacíos y de error dicen qué pasó.
7. Sin desbordes ni scroll horizontal en 1280 px; tablas legibles.

## 3. Mapa del sistema (verificado en el código)

| Módulo | Pantallas (`frontend/src/app`) | API (`backend/src/apps`) | Quién |
|---|---|---|---|
| Productos | `/inventory/products` (+ new, [id], edit, variantes, etiquetas) | `inventory/views/product.py` | ADMIN, INVENTORY (escritura); SALES/CUSTOMERS/READ_ONLY leen |
| Ubicaciones | `/inventory/locations` (+ new, [id], edit, etiquetas) | `StorageLocationViewSet` (sin DELETE: se desactiva) | ADMIN, INVENTORY |
| Existencias por ubicación | `/inventory/stock-by-location` | `reports/stock-by-location` | ADMIN |
| Proveedores | `/inventory/suppliers` | `SupplierViewSet`, `supplier-products` | ADMIN |
| Compras | `/inventory/purchases` (+ new, [id], edit) | `PurchaseViewSet`: confirm, cancel, calculate-costs, cost-summary; `import-costs` | ADMIN (READ_ONLY lee) |
| Conteos | `/inventory/counts` | `inventory-counts`: approve, cancel | ADMIN (READ_ONLY lee) |
| Traslados | `/inventory/transfers` | `stock-transfers`: confirm, cancel; `branches` | ADMIN |
| Movimientos (kárdex) | `/inventory/movements` (desde Reportes) | `stock-movements` + pdf/excel | ADMIN |
| Ventas | `/sales` (+ new, [id], edit) | `SaleViewSet`: confirm, cancel; `sale-items` | ADMIN, SALES (READ_ONLY lee) |
| Proforma | `/sales/proforma` | `documents` proforma PDF | ADMIN, SALES, INVENTORY |
| Clientes / inyectores | `/customers`, `/injectors` | `customers/views.py` | ADMIN, CUSTOMERS; SALES crea cliente desde la venta |
| Servicios | `/services` (+ new, [id], types) | receive, start, mark-ready, deliver (ADMIN), cancel; charge lines y precio solo ADMIN | ADMIN, CUSTOMERS |
| Caja | `/cash` (+ new, [id]) | closings: preview, closeable-weeks, create, pdf; petty-cash | ADMIN |
| Reportes | `/reports/*` (8 reportes, PDF y Excel) | `core/views/reports.py`, `report_pdfs.py` | ADMIN |
| Búsqueda | `/search` | `core/views/search.py` | según permisos de cada resultado |
| Dashboard | `/dashboard` | `dashboard/summary` | todos (contenido según rol) |
| Usuarios / cuenta | `/users`, `/account` | `accounts` | ADMIN / cada usuario |
| Estado del sistema | `/system/status` | — | ADMIN |

Notas de dominio que condicionan las combinaciones:

- **Existencia global**: el stock no es por ubicación. La ubicación es un dato del producto
  (`Product.storage_location`, una sola). "Mover un producto de ubicación" = editar su ubicación.
  Las variantes no heredan un cambio posterior del padre (decisión documentada en `VariantKind`).
- **Servicios siempre tienen cliente**: el servicio cuelga de un inyector y el inyector de un
  cliente (`Injector.customer` obligatorio). La combinación "servicio sin cliente" no existe; se
  prueba que la pantalla no la ofrezca.
- Ventas y servicios creados desde la pantalla arrancan con IVA 13 %; descuento por monto o %.
- Montos congelados: la venta al confirmar, el servicio al entregar. La caja suma esos montos.

## 4. Hallazgos del análisis de código (candidatos, se confirman en el recorrido)

| Id | Dónde | Qué pasa | Severidad estimada |
|---|---|---|---|
| A-01 | `features/inventory/purchases/format.ts` `formatColones` y 18 archivos con `₡{formatMoney(x)}` | Un monto negativo sale `₡-2 500`. No es solo la lista de cierres: afecta toda cifra que puede ser negativa (diferencia, "Se retira de la caja", ajustes). El PDF de caja ya lo hace bien (`cash/pdf.py` `_signed_crc`). | Baja (bug conocido) |
| A-02 | `sales/services/sale.py`, `customers/views.py` deliver | Se puede **confirmar una venta con fecha de una semana ya cerrada** (y entregar un servicio con `delivered_at` en esa semana). El cierre ya fijó sus montos, así que ese dinero no entra en ningún cierre: queda fuera de la caja para siempre. Los gastos de caja chica sí tienen esta protección (`PettyCashWeekClosedError`). | **Alta** |
| A-03 | Mismo lugar | Anular una venta confirmada de una semana cerrada: el cierre la contó como cobrada y la anulación devuelve inventario, pero ningún cierre refleja la devolución del dinero. | Media (decisión P2) |
| A-04 | `sales/serializers.py`, `sale-form.tsx` | La fecha de venta acepta días futuros: la venta cae en una semana que todavía no existe para la caja. | Media (decisión P3) |
| A-05 | `cash/selectors.py` `weeks_pending_closing` | Una semana con gastos de caja chica pero sin ventas ni servicios no aparece en "semanas por cerrar": esos gastos nunca se cierran y el fondo siguiente no los refleja. | Media |
| A-06 | `cash/serializers.py` `expected_physical_total` | El sobregiro se descuenta del total cobrado de todos los métodos. Si la semana se cobró casi todo con tarjeta, "Debe haber al contar" puede incluir vouchers como si fueran efectivo para pagar el gasto. Se verifica que el aviso "supera el efectivo en caja" lo cubra. | Media (verificar) |
| A-07 | `customers/services/service_charges.py` | Líneas de cobro en ₡0 dan precio 0 y el servicio se entrega con total ₡0 (¿garantía?). Se verifica que se vea claro y que no rompa caja ni factura. | Baja (verificar) |
| A-08 | Ubicaciones | Verificar si un producto se puede asignar a una ubicación **inactiva** y qué pasa al desactivar una ubicación con productos. | Media (verificar) |

## 5. Plan de pruebas (orden del recorrido)

El orden sigue el flujo real del negocio: primero lo que crea inventario, después lo que lo saca,
al final la caja, que depende de todo lo anterior. Cada caso tiene id para anotarlo en la sección 7.
"API" = además de la pantalla se mira la respuesta en la pestaña de red.

### Fase 0 — Preparación

- 0.1 Entrar como `demo.admin`; anotar existencias iniciales de 4 productos de prueba (P1 con
  stock alto, P2 con stock 1–3, P3 sin precio de venta, P4 con variante) y el estado de caja
  (`/cash`: fondo, gastos, efectivo en caja; ¿la semana 31-oct → 6-nov ya está cerrada?).
- 0.2 Confirmar en `/cash/new` qué semanas se ofrecen para cerrar.

### Fase 1 — Ubicaciones y productos

| Id | Caso | Esperado |
|---|---|---|
| U-01 | Crear ubicación `qaia1` | Se guarda como `QAIA1` |
| U-02 | Código con espacio, guion, vacío, 11 caracteres, duplicado (`QAIA1` y `qaia1`) | Rechazado con mensaje en el campo |
| U-03 | Editar descripción; Ctrl+S; cancelar con cambios | Guarda / avisa cambios sin guardar |
| U-04 | Mover P1 a `QAIA1` editando el producto | Lista de productos, ficha y "Existencias por ubicación" lo muestran en la nueva |
| U-05 | Mover P4 (con variante): ¿la variante se queda en la vieja? | Se queda (decisión documentada); se ve claro en la ficha |
| U-06 | Crear producto nuevo eligiendo "+ Nueva ubicación…" en el select | Crea y deja seleccionada |
| U-07 | Desactivar `QAIA1` con productos dentro | Definir comportamiento (A-08): no debería ofrecerse para nuevos productos |
| U-08 | Asignar un producto a ubicación inactiva por pantalla y por API | Rechazado o no ofrecido (A-08) |
| U-09 | Etiquetas de ubicaciones y de productos (PDF), con 0 seleccionadas | PDF correcto / mensaje claro |
| U-10 | Búsqueda de ubicación por código y descripción; filtro activas/inactivas | Resultados correctos |
| U-11 | Producto: código propio duplicado, variante, precio manual vs. sugerido, mínimo de stock | Validaciones y precio vigente correctos |

### Fase 2 — Compras (colones, dólares, mixtas)

| Id | Caso | Esperado |
|---|---|---|
| C-01 | Compra CRC, 2 líneas, costo adicional CRC, margen 30 %, calcular, confirmar | Costo final y precio sugerido en ₡ correctos; stock sube; precio vigente del producto cambia |
| C-02 | Compra USD (tipo de cambio 510), costo adicional USD y otro CRC | Todo convertido a ₡; equivalentes visibles en cada monto |
| C-03 | Compra CRC con costo adicional en USD | Costo USD × su tipo de cambio |
| C-04 | En borrador: editar cantidad, costo unitario, proveedor, fecha, moneda, tipo de cambio | Cambiar moneda/tipo descarta el cálculo y lo dice |
| C-05 | Tipo de cambio fuera de 100–2000, 0, vacío, con coma | Rechazado con mensaje |
| C-06 | Recalcular con otro margen (borrador y confirmada) | Reemplaza, no duplica el histórico |
| C-07 | Confirmar sin líneas; confirmar dos veces | Rechazado |
| C-08 | Eliminar borrador con cálculo hecho | Se elimina sin error |
| C-09 | Anular compra confirmada (con motivo); sin motivo | Stock baja exactamente lo que entró / pide motivo |
| C-10 | Anular compra cuyo producto ya se vendió (stock insuficiente) | Rechazado con mensaje claro, nada cambia |
| C-11 | Anulada: intentar editar, agregar costo, recalcular | Rechazado |
| C-12 | Precio de venta del producto después de anular la compra que lo fijó | Vuelve al de la compra confirmada anterior |
| C-13 | Lista de compras: filtros por estado, proveedor, fechas; montos con moneda | Correctos |

### Fase 3 — Conteos físicos y traslados

| Id | Caso | Esperado |
|---|---|---|
| K-01 | Conteo con 3 líneas: contado > sistema, < sistema, igual | Al aprobar: ajuste de entrada, ajuste de salida, nada |
| K-02 | Referencia duplicada; producto repetido en el conteo; cantidad negativa | Rechazado |
| K-03 | Aprobar dos veces; anular aprobado; anular borrador | Rechazado / rechazado / anulado sin movimientos |
| K-04 | Kárdex del producto muestra el ajuste con el origen "Conteo físico QA-IA…" | Correcto |
| T-01 | Traslado a sede nueva creada desde el select; 2 líneas; confirmar | Stock baja; movimientos "Traslado a sede" |
| T-02 | Confirmar con una línea sin stock suficiente | Rechazado nombrando la línea, nada se mueve |
| T-03 | Anular borrador (sin motivo) / anular confirmado sin motivo / con motivo | Anulado / pide motivo / stock vuelve |
| T-04 | Sede inactiva al confirmar | Rechazado con mensaje |
| T-05 | Editar líneas de un traslado confirmado | Rechazado |

### Fase 4 — Ventas (todas las combinaciones)

Factores: método de pago (Efectivo, Tarjeta, Transferencia, Otro) × cliente (con / sin / creado
desde la venta) × descuento (ninguno / monto / %) × impuesto (13 % / 0 % / otro) × ciclo
(borrador guardado, borrador eliminado, confirmada, confirmada → anulada). Se cubren todos los
pares de factores (16 ventas) más los casos límite.

| Id | Pago | Cliente | Descuento | Impuesto | Ciclo |
|---|---|---|---|---|---|
| V-01 | Efectivo | sin | ninguno | 13 % | confirmada |
| V-02 | Efectivo | con | monto | 0 % | confirmada → anulada |
| V-03 | Efectivo | nuevo (desde la venta) | % | 13 % | confirmada |
| V-04 | Efectivo | con | % | otro (4 %) | borrador guardado |
| V-05 | Tarjeta | con | ninguno | 0 % | confirmada |
| V-06 | Tarjeta | sin | monto | 13 % | confirmada |
| V-07 | Tarjeta | con | % | 13 % | confirmada → anulada |
| V-08 | Tarjeta | sin | ninguno | otro | borrador eliminado |
| V-09 | Transferencia | sin | % | 0 % | confirmada |
| V-10 | Transferencia | con | ninguno | 13 % | confirmada |
| V-11 | Transferencia | con | monto | otro | confirmada |
| V-12 | Transferencia | sin | monto | 13 % | confirmada → anulada |
| V-13 | Otro | con | monto | 13 % | confirmada |
| V-14 | Otro | sin | % | 13 % | confirmada |
| V-15 | Otro | con | ninguno | 0 % | confirmada → anulada |
| V-16 | Otro | sin | ninguno | 13 % | borrador guardado |

Las confirmadas V-01, V-02, V-05, V-06, V-09, V-10, V-13, V-14 llevan fecha del 31-oct al 6-nov
para que entren en el cierre (fase 6); el resto, fecha de hoy. Por cada una se verifica: total en
el formulario = detalle = lista = PDF; stock baja al confirmar y vuelve al anular.

Casos límite:

| Id | Caso | Esperado |
|---|---|---|
| V-20 | Descuento = subtotal (total = 0) | Se permite, total ₡0, impuesto ₡0 |
| V-21 | Descuento monto > subtotal; % > 100; negativo | Rechazado en el campo |
| V-22 | Quitar líneas hasta que el descuento supere el subtotal | Aviso visible; no deja confirmar |
| V-23 | Impuesto 100 %, 101 %, decimales (13.5) | 100 ok, 101 rechazado, decimales ok |
| V-24 | Producto sin precio (P3): sin precio unitario / con precio manual | Pide precio / acepta |
| V-25 | Mismo producto dos veces | Rechazado o suma; mensaje claro |
| V-26 | Cantidad 0, negativa, decimal, mayor que el stock | Rechazado; al confirmar "No hay inventario suficiente" |
| V-27 | Dos ventas en borrador por todo el stock de P2, confirmar ambas | La segunda se rechaza |
| V-28 | Confirmar sin líneas; editar o agregar línea a confirmada; anular borrador; anular sin motivo; anular dos veces | Todo rechazado con mensaje |
| V-29 | PDF de borrador y de anulada | Rechazado / no ofrecido |
| V-30 | Fecha de una semana ya cerrada (A-02) y fecha futura (A-04) | Según decisiones P1 y P3 |
| V-31 | Escaneo de código completo en la búsqueda de producto | Se selecciona solo |
| V-32 | Montos con céntimos (precio 1 234.56 × 3, descuento 7.5 %) | Redondeo correcto al céntimo |
| PF-01 | Proforma con cliente, descuento %, IVA 13 % | PDF con los mismos montos que daría la venta |
| PF-02 | Proforma sin cliente, producto sin precio, 0 líneas | Pide precio / rechaza vacía |
| PF-03 | Proforma como `demo.ventas` y `demo.inventario` | Ambos pueden; no ven costos |

### Fase 5 — Servicios de inyectores

Factores: ciclo de estado × método de pago × descuento × impuesto × cliente (existente / nuevo
con inyector nuevo; "sin cliente" no existe, ver sección 3) × contenido del cobro (solo líneas /
solo accesorios / ambos).

| Id | Ciclo | Pago | Descuento | Impuesto | Cobro |
|---|---|---|---|---|---|
| S-01 | Recibido → En proceso → Listo → Entregado | Efectivo | ninguno | 13 % | líneas |
| S-02 | igual | Tarjeta | monto | 13 % | accesorios |
| S-03 | igual | Transferencia | % | 0 % | ambos |
| S-04 | igual | Otro | ninguno | 0 % | líneas |
| S-05 | Recibido → Anulado | — | — | — | accesorio (vuelve al stock) |
| S-06 | En proceso → Anulado | — | — | — | ambos |
| S-07 | Listo → Anulado | — | % | 13 % | ambos |
| S-08 | Recepción múltiple (3 inyectores, cliente nuevo creado desde el formulario) | — | — | — | — |

S-01 a S-03 se entregan con fecha del 31-oct al 6-nov para el cierre.

Casos límite:

| Id | Caso | Esperado |
|---|---|---|
| S-20 | Entregar sin líneas ni accesorios | Rechazado con el mensaje de "nada que cobrar" |
| S-21 | Descuento mayor que el precio al entregar | Rechazado; sigue en Listo |
| S-22 | Saltar estados (Recibido → Entregado), retroceder, anular entregado | Rechazado |
| S-23 | Accesorio con más cantidad que el stock; quitar accesorio en borrador | Rechazado / stock vuelve |
| S-24 | Editar líneas/accesorios de un servicio entregado o anulado | Rechazado |
| S-25 | Líneas en ₡0 (A-07) | Se ve claro; caja y factura correctas |
| S-26 | Total que supera ₡99 999 999,99 | Rechazado sin error 500 |
| S-27 | `demo.servicios`: no ve precio, no puede entregar ni poner descuento | Oculto en pantalla y 403 en API |
| S-28 | Fecha de entrega en semana cerrada (A-02) | Según decisión P1 |
| S-29 | Comprobante PDF: entregado (ADMIN) / no entregado / como `demo.servicios` | PDF / rechazado / 403 |
| S-30 | Tipos de servicio: crear desde la línea de cobro con "+ Nuevo tipo…", editar, desactivar | Correcto |

### Fase 6 — Caja chica y cierre (al final)

Semana del cierre: **31 de octubre al 6 de noviembre de 2026**. Antes de G-05 se anotan los
números esperados calculados a mano y se comparan con la pantalla.

| Id | Caso | Esperado |
|---|---|---|
| G-01 | `/cash`: tarjeta de la semana muestra fondo + ingresos en efectivo − gastos = efectivo en caja | Cuadra con V/S de efectivo de esa semana |
| G-02 | Gasto dentro del fondo | Saldo del fondo baja; sin sobregiro |
| G-03 | Gasto que supera el fondo pero cabe en el efectivo de la semana | Sobregiro = gastos − fondo; aviso de que toma de los ingresos |
| G-04 | Gasto que supera el efectivo en caja | Aviso y confirmación; no bloquea |
| G-05 | Gasto con fecha futura, monto 0, motivo vacío, fecha en semana cerrada | Rechazado |
| G-06 | Borrar un gasto de semana abierta / de semana cerrada | Se borra / rechazado |
| G-07 | Vista previa del cierre: por método, impuestos, descuentos, fondo, gastos, sobregiro, "Debe haber al contar" | Igual al cálculo a mano |
| G-08 | Contado distinto de lo esperado sin motivo / con motivo | Pide motivo / acepta |
| G-09 | Fondo siguiente distinto del actual | "Se retira de la caja" = contado − fondo siguiente |
| G-10 | Contado menor que el fondo siguiente | "Se retira" negativo, mostrado como `−₡…` (A-01) y explicado como reponer |
| G-11 | **Crear el cierre** (con aviso previo a Alejandro) | Montos fijados = vista previa; PDF igual |
| G-12 | Lista de cierres: diferencia negativa | `−₡2 500` (A-01) |
| G-13 | Después del cierre: gasto en esa semana, venta nueva con fecha en esa semana, anular una venta de esa semana | Gasto rechazado; venta y anulación según P1/P2 |
| G-14 | Cerrar la semana en curso; cerrar dos veces la misma | Rechazado |
| G-15 | Semana con solo gastos (A-05) | Según decisión |

### Fase 7 — Transversal

| Id | Área | Casos |
|---|---|---|
| R-01..08 | Reportes | Los 8 reportes con y sin filtros, rango vacío, PDF y Excel; cifras = pantallas de origen (ventas anuladas excluidas, servicios solo entregados) |
| B-01 | Búsqueda | Por código universal, código propio, nombre, cliente, cédula, número de inyector, # de venta; resultados respetan el rol |
| D-01 | Dashboard | Ventas de hoy/semana, servicios pendientes, stock bajo, "falta cerrar caja" cuadran con las pantallas |
| P-01..05 | Permisos | Por cada uno de los 5 usuarios: menú, URL directa a cada módulo prohibido, acción prohibida por API (403), sin ver costos donde no corresponde |
| F-01 | PDFs | Factura de venta, comprobante de servicio, proforma, cierre de caja, etiquetas, reportes, kárdex: montos, signos, acentos, cortes de página |
| X-01 | Usabilidad | Por cada pantalla recorrida: criterios de la sección 2 (formato ₡, alineación, radios, Ctrl+S, cambios sin guardar, mensajes, estados vacíos) |
| X-02 | Usuarios | Crear usuario, cambiar rol, desactivar, cambiar contraseña propia |
| X-03 | Errores | API caída o 500 en una pantalla: mensaje entendible, sin pantalla en blanco |

## 6. Decisiones para Alejandro (antes del recorrido)

**Respuestas de Alejandro (2026-11-07):**

- P1: **A**. Se bloquean las ventas confirmadas y los servicios entregados con fecha de una semana cerrada.
- P2: **A**. Anular está permitido, con aviso. La devolución **no** se resta de ninguna caja: si el
  negocio lo quiere, lo registra a mano (la mayoría de las devoluciones son por transferencia).
- P3: **A**. No se aceptan fechas de venta posteriores a hoy.
- P4: "lo que sea mejor" → se aplica la recomendación: las semanas que solo tienen gastos también
  se ofrecen para cerrar.
- P5: **C**. Una ubicación inactiva no se ofrece ni se acepta para productos, y no se puede
  desactivar mientras tenga productos activos. Antes se revisa qué hace hoy el código.
- P6: **Sí**. Se crea el cierre de prueba en la base de desarrollo.
- Servicio con total ₡0 (A-07): se deja como está.

- **P1 (A-02). Venta confirmada o servicio entregado con fecha en una semana ya cerrada.**
  Recomendación: **bloquearlo** con el mismo criterio que los gastos ("La semana de esa fecha ya
  tiene cierre de caja"). Quien registre algo atrasado lo pone con fecha de la semana abierta.
  Alternativa: permitirlo y que entre en la semana siguiente (más complejo, mezcla fechas).
- **P2 (A-03). Anular una venta de una semana ya cerrada.** Recomendación: **permitirlo** (la
  devolución real ocurre después), pero con un aviso en la confirmación: "Esta venta ya se contó en
  el cierre del … El dinero devuelto no se descuenta de ningún cierre." Alternativa: bloquearlo.
- **P3 (A-04). Fecha de venta futura.** Recomendación: **no permitir** fechas después de hoy (igual
  que los gastos).
- **P4 (A-05). Semana con solo gastos de caja chica.** Recomendación: ofrecerla en "semanas por
  cerrar" también cuando tiene gastos.
- **P5 (A-08). Ubicación inactiva.** Recomendación: no ofrecerla al crear o editar productos y
  rechazarla en la API; los productos que ya están en ella se quedan y la ficha lo muestra.
- **P6.** ¿Se puede crear el cierre de la semana del 31-oct al 6-nov en la base de desarrollo
  (irreversible) para probar G-11 a G-13?

## 7. Registro de hallazgos del recorrido

Recorrido hecho el 2026-11-07 como `demo.admin`. Los casos de API se corrieron desde la pestaña de
la app (mismo token que la pantalla). Las pantallas de caja se recorrieron a mano. Para los
permisos se crearon `qa-ia.inventario`, `qa-ia.ventas`, `qa-ia.servicios` y `qa-ia.lectura`,
porque `demo.inventario`, `demo.ventas` y `demo.servicios` ya no tienen la contraseña del seed
(alguien la cambió en la base de desarrollo). Todo lo creado lleva `QA-IA`.

### 7.1 Lo que funcionó tal como se esperaba

- **Ubicaciones (U-01…U-11):** código en mayúsculas; espacios, guiones, más de 10 caracteres y
  repetidos rechazados. Mover producto y variante funciona. Una ubicación inactiva no se ofrece ni
  se acepta, y no se puede desactivar con productos activos: **P5 ya estaba implementado**. Las
  etiquetas y la búsqueda funcionan.
- **Compras (C-01…C-13):** CRC (factor 1.1, precio con margen 30 % exacto); USD 510 con costos en
  USD y en CRC (₡1 657.50 → ₡2 071.88); CRC con costo en USD; cambiar el tipo de cambio descarta el
  cálculo; rango 100–2000; recalcular reemplaza el cálculo (no lo duplica); anular devuelve el stock
  y el precio anterior (₡1 375 → ₡715); una compra anulada no se edita.
- **Conteos y traslados (K, T):** ajustes de entrada y salida correctos; aprobar o anular dos veces
  se rechaza. Traslado con faltante nombra la línea; anular un confirmado devuelve el stock; sede
  inactiva rechazada; guía PDF correcta.
- **Ventas (V-01…V-16):** las 16 combinaciones cuadran al céntimo con el cálculo a mano (por
  ejemplo, V-03: 10 % + IVA → ₡3 528.10; V-14: 100 % → ₡0). Confirmar, anular y eliminar borrador
  funcionan; el stock sale y vuelve.
- **Casos límite de ventas:** el descuento mayor que el subtotal, el % mayor que 100 y el impuesto
  mayor que 100 se rechazan. Quitar líneas deja un aviso y no permite confirmar. Producto sin precio:
  pide precio. Sin stock: "No hay inventario suficiente". El PDF solo sale de ventas confirmadas.
- **Proforma (PF):** PDF con descuento e impuesto; producto sin precio sale "Sin precio definido";
  vacía se rechaza.
- **Servicios (S-01…S-08):** los 4 métodos de pago con descuento por monto o %, e impuesto 13 % o
  0 %, cuadran. Al anular desde Recibido, En proceso o Listo vuelven los accesorios. Rechazados:
  saltar estados, anular un entregado, editar un entregado, el máximo de ₡99 999 999,99, y entregar
  sin cobro. `demo.servicios` no ve precios ni entrega (403). El comprobante PDF es solo de
  servicios entregados y del ADMIN. La recepción múltiple funciona.
- **Caja (G-01…G-14):** vista previa de la semana del 31-oct = cálculo a mano: efectivo
  ₡31 831.11, tarjeta ₡6 859.12, transferencia ₡6 955.59, otro ₡3 355.11, total ₡49 000.93.
  Gastos ₡7 200 con un fondo de ₡5 000 → sobregiro ₡2 200 y "Debe haber" ₡46 800.93. El aviso
  "Supera el efectivo…" aparece y pide confirmar. Contado ₡44 300.93 → diferencia −₡2 500,
  y pide motivo. Fondo siguiente ₡3 000 → "Se retira" ₡41 300.93. Con contado menor que el fondo
  dice "Hay que reponer ₡1 000". **Cierre #20 creado** (P6); su PDF sale bien. Después del cierre
  se rechazan: gasto en esa semana, cerrar la misma semana dos veces, cerrar la semana en curso y
  cerrar una semana que no empieza en sábado. La semana siguiente hereda el fondo de ₡3 000.
- **Reportes:** el resumen de ventas de esa semana = el cierre (₡49 000.93, mismo desglose). Los
  8 reportes, sus PDF, el Excel y el kárdex responden.
- **Permisos (P-01…P-05):** la matriz de la API coincide con `setup_roles`.
- **Dashboard:** "Falta cerrar la caja de la semana pasada" aparecía antes del cierre.

### 7.2 Hallazgos

| Id | Caso | Dónde | Esperado | Obtenido | Sev. | Estado |
|---|---|---|---|---|---|---|
| H-01 (A-01) | G-12 | `formatColones` y `₡{formatMoney(x)}` en 18 archivos | `−₡2 500` | `₡-2 500` en lista y detalle de cierres | Baja | **Corregido**: `formatColones` pone el signo y todas las cifras pasan por él |
| H-02 (A-02) | V-30 | `confirm_sale` | Rechazar fecha de semana cerrada (P1) | Venta #176 del 27-oct confirmada en la semana ya cerrada del 24-oct | **Alta** | **Corregido** al confirmar y al guardar la fecha (`sale_date_error`) + tests |
| H-03 (A-03) | G-13 | Anular venta | Aviso (P2) | Sin aviso | Media | **Corregido**: `in_closed_cash_week` + aviso en el panel de anulación |
| H-04 (A-04) | V-30 | Fecha de venta | Rechazar futura (P3) | Venta con fecha 01-dic aceptada | Media | **Corregido**: backend + `max` y validación en el formulario |
| H-05 (A-05) | G-15 | `weeks_pending_closing` | Ofrecer semanas con solo gastos (P4) | No las ofrecía | Media | **Corregido** + test |
| H-06 | G-11 | `/cash/new` | Confirmar antes de un cierre irreversible | Se creó directo con Ctrl+S, sin preguntar | Media | **Corregido**: pide confirmación con la semana |
| H-07 | U-11 | Producto, código propio repetido | "Ya existe un producto con este código propio." | "Ya existe Producto con este own code." | Media | **Corregido** (`validators: []`, el mensaje ya existía) |
| H-08 | V-25, K-02, S, C | Línea de venta, línea de conteo, referencia de conteo, inyector, accesorio, factura de compra repetidos | Mensaje claro | "Los campos sale, product deben formar un conjunto único." y similares | Media | **Corregido** en los 6 serializers + tests |
| H-09 | V-28 | Agregar un producto ya existente a una venta confirmada | "Solo se pueden modificar líneas de ventas en borrador." | El mensaje de duplicado | Baja | **Corregido** (el estado se revisa antes) |
| H-10 | K-03 | Aprobar conteo sin líneas | Rechazar | Quedó APROBADO (QA-IA-K03) | Media | **Corregido** + test |
| H-11 | S-22 | Transición de servicio inválida | Etiquetas en español | "No se puede cambiar de RECEIVED a READY." | Baja | **Corregido** |
| H-12 | X-01 | Tablas con montos (lista de cierres, reportes, etc.) | Monto en una línea | "₡1 182 / 410.96" partido en dos | Baja | **Corregido**: `whitespace-nowrap` en todas las celdas de montos |
| H-13 | B-01 | Búsqueda | Encontrar la venta #156 | Solo buscaba por nombre del cliente | Media | **Corregido**: número de venta, cualquier estado, venta de mostrador |
| H-14 | U | Mensajes de ubicación | Tono neutro | "No puede asignar…", "No puede inactivar…" | Baja | **Corregido** |
| H-15 | G-14 | Cerrar semana futura | Fecha dd/mm/aaaa | "(2026-11-13)" | Baja | **Corregido** |
| H-16 | S-28 | `deliver` | — | `delivered_at` es de solo lectura: la entrega siempre queda con fecha de ahora, así que un servicio no puede caer en una semana cerrada. El parámetro `delivered_at` de la API se ignora sin aviso. | Info | Sin cambio (el caso A-02 no aplica a servicios) |
| H-17 | X-01 | Mensajes genéricos de DRF | Tono neutro | "Asegúrese de que este valor es mayor o igual a 0.", "Este campo no puede estar en blanco." (motivo vacío), "date_from no puede ser mayor que date_to." | Baja | **Pendiente**. Las pantallas validan antes, así que casi no se ven. Cambiarlos es una pasada global aparte. |
| H-18 | — | Ventas, servicios y vista previa de caja | Montos como texto exacto | Llegan como número JSON (`3920.11`) | Baja | **Pendiente**. Hoy no hay error de redondeo visible (2 decimales). Las compras ya devuelven texto. |
| H-19 | P | Base de desarrollo | Usuarios demo con la contraseña del seed | 3 de 5 tienen otra contraseña | Info | Avisado. Los usuarios `qa-ia.*` quedaron **desactivados** al terminar. |

Datos que quedaron en la base de desarrollo: la venta #176 (confirmada el 27-oct, antes de la
corrección, dentro de la semana cerrada del 24-oct), la venta borrador #175 (fecha 01-dic), el
conteo vacío aprobado QA-IA-K03, el cierre #20 y las compras, ventas y servicios `QA-IA`.

## 8. Checklist de avance

- [x] Fase 1 del pedido: análisis del backend y del frontend
- [x] Fase 2 del pedido: este plan
- [x] Aprobación del plan y respuestas P1–P6
- [x] Recorrido fases 0–7 con hallazgos anotados (sección 7)
- [x] Correcciones con tests (escritos; falta que Alejandro los corra)
- [x] `CHANGELOG.md` bajo `[No liberado]`
- [x] Comandos de verificación para Alejandro
- [ ] Pendientes H-17 y H-18 (baja prioridad)
