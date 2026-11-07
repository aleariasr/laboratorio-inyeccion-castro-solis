# Auditoría y propuesta: ingresos en la caja y sobregiro de caja chica (2026-11-07)

Pedido del cliente:

1. Que en la caja se vaya sumando el monto de los ingresos que va teniendo el negocio.
2. "Sobregiro": cuando sale un gasto imprevisto (ej. reparar el techo) y el fondo de caja chica no
   alcanza, poder usar el dinero extra que hay en la caja (lo que entró por ingresos).

Estado: **aprobado por Alejandro el 2026-11-07 con todas las recomendaciones (P1 a P6) e
implementado** sin migración.

---

## 1. Cómo funciona hoy (verificado en el código)

### Modelos (`backend/src/apps/cash/models.py`)

- `CashClosing`: un cierre por semana (sábado a viernes), sin edición ni borrado. Al crearse **fija**:
  - `expected_total` = ventas confirmadas + servicios entregados de la semana, los 4 métodos de pago,
    con desglose `expected_cash / card / transfer / other`, más `expected_tax` y `expected_discount`.
  - Caja chica: `petty_cash_opening` (fondo al inicio), `petty_cash_outflows` (suma de salidas),
    `next_petty_cash_opening` (fondo de la semana siguiente; vacío = el mismo).
  - `counted_total` (un solo número: efectivo + caja chica + vouchers + comprobantes),
    `difference`, `difference_reason` (obligatorio si la diferencia no es cero).
- `PettyCashMovement`: solo **salidas** (fecha, monto > 0, motivo). Pertenece a la semana de su fecha;
  no se registra ni se borra si esa semana ya está cerrada, ni con fecha futura.

### Cálculos (`services.py`, `selectors.py`, `serializers.py`)

- Fondo de la semana = `next_petty_cash_opening` del último cierre anterior; la primera vez se escribe
  al cerrar (la vista previa lo devuelve `null`).
- Saldo de caja chica = fondo − salidas (derivado, no se guarda).
- **Debe haber al contar** = `expected_total` + saldo de caja chica.
- Diferencia = contado − lo que debe haber.
- La vista previa (`GET /api/cash/closings/preview/?week_start=`) **ya funciona para la semana en
  curso** y devuelve lo cobrado hasta hoy por método de pago.

### Pantallas

- `/cash` → `PettyCashWeekCard`: "Caja chica de esta semana" con **Fondo / Salidas / Saldo**, la lista
  de salidas y el formulario para registrar una. **No muestra los ingresos** de la semana (aunque los
  pide en la vista previa, no los usa).
- `/cash/new` → `CashClosingForm`: `PhysicalTotalHero` ("Debe haber al contar" = cobrado + saldo),
  desglose por método, impuestos, `PettyCashSummary` (fondo − salidas = saldo) y el fondo de la
  semana siguiente.
- `/cash/[id]` y el PDF del cierre: lo mismo, ya fijado.

### Hallazgo clave: el sobregiro ya "cuadra" en la matemática, pero nadie lo ve como tal

Hoy nada impide que las salidas superen el fondo. Si pasa, el saldo queda negativo y "Debe haber al
contar" baja en esa cantidad, que es **exactamente lo correcto**: la plata extra salió de los ingresos
que estaban en la caja. Lo que falta es de presentación y de control:

- La tarjeta de la semana muestra el saldo en rojo como si fuera un error, sin decir de dónde salió.
- El resumen del cierre dice "Las salidas superan el fondo." (suena a falla, no a sobregiro).
- Nadie avisa si el gasto supera también el efectivo que hay en la caja.
- No se ve cuánto efectivo hay realmente en la caja durante la semana (pedido 1).

### Supuesto del modelo actual que conviene confirmar

Cada cierre arranca la semana siguiente **solo con el fondo de caja chica**: no hay saldo arrastrado de
ingresos. Es decir, se asume que al cerrar se retira (deposita / se lleva el dueño) todo lo que no es
el fondo. Ver pregunta P1.

---

## 2. Propuesta de diseño

### 2.1 Idea central

La caja es **una sola caja física** con dos "bolsillos" contables:

```
Efectivo en caja ahora = Fondo + Ingresos en efectivo de la semana − Gastos de la semana
```

- Los gastos se pagan **primero del fondo**.
- Cuando el fondo se acaba, el resto sale de los ingresos: eso es el **sobregiro**.
- `Sobregiro = max(0, Gastos − Fondo)`. Se **deriva**, no se guarda ni se marca gasto por gasto.

### 2.2 De dónde sale la plata extra

Del **efectivo** cobrado en la semana (ventas confirmadas y servicios entregados pagados en efectivo,
`expected_cash`). Tarjeta y transferencia no están en la caja como billetes: no sirven para pagarle al
del techo. Lo que debe haber al contar sigue incluyendo vouchers y comprobantes, como hoy.

### 2.3 Cómo se registra

Igual que hoy: "Registrar gasto" con fecha, monto y motivo. No se agrega un campo "pagado con".

Al escribir el monto, el formulario avisa en vivo:

- Si cabe en el saldo del fondo: nada.
- Si supera el saldo del fondo: aviso informativo (no bloquea) — "₡X salen del fondo y ₡Y de los
  ingresos de la semana (sobregiro)."
- Si supera también el efectivo en caja: pide confirmación — "Este gasto supera el efectivo que el
  sistema calcula en la caja (₡Z). ¿Registrarlo igual?" (ver P3: recomiendo no bloquear).

### 2.4 Qué ve el usuario en `/cash` (tarjeta "Caja de esta semana")

Se renombra de "Caja chica de esta semana" a **"Caja de esta semana"** y pasa a mostrar:

| Tarjeta | Valor |
|---|---|
| Fondo de caja chica | ₡fondo |
| + Ingresos en efectivo (hasta hoy) | ₡expected_cash |
| − Gastos | ₡salidas |
| **= Efectivo en caja** (destacada) | fondo + ingresos − gastos |

Debajo, en una línea: "Cobrado con tarjeta, transferencia u otro: ₡X (no está en efectivo)" y, si hay
sobregiro, una franja en tono de advertencia (no de error):
"Sobregiro: ₡Y de los gastos se pagaron con los ingresos. El fondo se repone al cerrar la semana."

El "Saldo de caja chica" deja de mostrarse negativo: queda en ₡0 y el exceso se muestra como sobregiro.

### 2.5 Cómo afecta el cierre y "Debe haber al contar"

- **El número no cambia**: Debe haber = cobrado + fondo − gastos (ya incluye el sobregiro). La
  diferencia y el motivo obligatorio quedan igual. Los cierres viejos se ven idénticos en sus totales.
- `PhysicalTotalHero`: el texto de abajo pasa de "Total cobrado ₡A más el saldo de caja chica −₡B" a
  "Cobrado ₡A + fondo ₡F − gastos ₡G" (con "de los cuales ₡S fueron sobregiro" cuando aplica).
- `PettyCashSummary` (formulario, detalle y PDF): Fondo / Gastos / Saldo del fondo (mínimo 0) y, si
  hay, una cuarta fila **"Pagado con ingresos (sobregiro)"**.
- El backend agrega `petty_cash_overdraft` (derivado) al cierre y a la vista previa, y
  `petty_cash_balance` se mantiene como hoy (puede ser negativo) para no romper nada.

### 2.6 Qué pasa entre semanas

- El sobregiro **no se arrastra como deuda**. Al cerrar, se cuenta todo, se deja el fondo de la semana
  siguiente (por defecto el mismo) y se retira el resto. Como el fondo se vuelve a dejar completo, el
  sobregiro queda "repuesto" con los ingresos automáticamente.
- Propuesta opcional (P4): mostrar en el cierre **"Se retira de la caja: contado − fondo siguiente"**,
  para que quede claro cuánto sale para depósito.

### 2.7 Migración

**Ninguna.** El sobregiro se deriva de campos que ya se fijan en el cierre (`petty_cash_opening` y
`petty_cash_outflows`), así que también aparece correcto en los cierres viejos.

---

## 3. Casos límite

1. **Primera semana sin fondo definido** (`petty_cash_opening = null`): todos los gastos cuentan como
   sobregiro contra los ingresos; la tarjeta muestra el fondo como "—" con la nota actual.
2. **Gasto mayor que el efectivo en caja**: "Efectivo en caja" queda negativo en rojo, con el aviso
   "Los gastos superan el efectivo registrado: puede faltar registrar ventas o la plata salió de otro
   lado." En el cierre aparecerá como diferencia, que ya exige motivo.
3. **Venta anulada o servicio revertido después del gasto**: baja el efectivo y puede pasar lo del punto
   2. No se bloquea nada retroactivamente.
4. **Orden dentro de la semana**: el cálculo es por semana, no por hora. Un gasto del lunes queda
   "cubierto" por ingresos del jueves. Es aceptable porque el cierre es semanal (ver P2).
5. **Gasto con fecha de una semana anterior aún sin cerrar**: cuenta contra los ingresos y el fondo de
   **esa** semana, no de la actual (la tarjeta solo muestra la semana en curso, como hoy).
6. **Semana anterior sin cerrar**: su efectivo sigue físicamente en la caja, pero el sistema no lo suma
   a la semana actual (cada semana se concilia sola). Se documenta; no se cambia.
7. **"Debe haber al contar" negativo** (gastos > fondo + todo lo cobrado): se muestra con signo, como
   ya hace `PhysicalTotalHero`; el contado mínimo es 0, así que el cierre exige motivo.
8. **Borrar un gasto**: recalcula todo igual que hoy, mientras la semana no esté cerrada.
9. **Fondo siguiente distinto**: si se baja o sube el fondo al cerrar, el sobregiro de esa semana no
   cambia (depende del fondo con que arrancó).
10. **Cierres históricos**: muestran el sobregiro derivado; sus totales no cambian.

---

## 4. Preguntas para Alejandro (con recomendación)

**P1. Al cerrar la semana, ¿los ingresos salen de la caja (se depositan / los retira el dueño) y solo
queda el fondo?**
- Recomendación: **sí, mantener ese modelo** (es el que el sistema ya asume). Si en realidad el dinero
  se queda acumulándose semana a semana, el cambio es mucho más grande (saldo arrastrado entre cierres,
  migración nueva) y conviene saberlo antes.

**P2. ¿El dinero extra disponible para sobregiro es solo el efectivo cobrado esa semana?**
- Recomendación: **sí, solo efectivo de la semana**. Tarjeta y transferencia no están en billetes;
  sumarlas mostraría plata que no existe en la caja. Trade-off: si el negocio guarda dinero de semanas
  anteriores en la misma caja, el sistema no lo verá (depende de P1).

**P3. Si un gasto supera el efectivo que el sistema calcula en la caja, ¿bloquear o avisar?**
- Recomendación: **avisar y pedir confirmación, no bloquear.** Puede haber ventas en efectivo aún sin
  confirmar en el sistema, o plata puesta de la bolsa del dueño. Bloquear obligaría a inventar
  registros. Trade-off: se puede registrar un gasto "imposible", pero el cierre lo convierte en
  diferencia con motivo obligatorio.

**P4. ¿Mostrar en el cierre "Se retira de la caja: ₡X" (contado − fondo siguiente)?**
- Recomendación: **sí**, es una línea más y responde la pregunta práctica de cuánto se deposita.
  Trade-off: incluye vouchers y comprobantes (papeles, no plata), así que el texto debe aclararlo; si
  preferís menos ruido, se deja para después.

**P5. ¿Renombrar "Salidas de caja chica" a "Gastos" y la tarjeta a "Caja de esta semana"?**
- Recomendación: **sí**. Con el sobregiro, un gasto ya no sale solo de la caja chica; "Gastos" es más
  claro para quien usa la pantalla. Los nombres del código y de la API (`petty_cash_*`) no cambian.

**P6. ¿Registrar en cada gasto si fue sobregiro (campo guardado) o solo calcularlo por semana?**
- Recomendación: **solo calcularlo** (sin migración). Marcar gasto por gasto obliga a decidir el orden
  (¿cuál de los gastos "rompió" el fondo?) y se desordena al borrar uno. Trade-off: la lista de gastos
  no dice cuál fue sobregiro; solo el total de la semana.

---

## 5. Plan por fases

**Fase 1 — Backend (sin migración)**
- `serializers.py`: función `petty_cash_overdraft(opening, outflows)` y campo
  `petty_cash_overdraft` en `CashClosingSerializer`.
- `views.py` (preview): agregar `petty_cash_overdraft` (y `petty_cash_fund_balance` = saldo mínimo 0).
- `pdf.py`: fila "Pagado con ingresos (sobregiro)" cuando hay, y "Se retira" si P4 = sí.
- Tests: preview y cierre con gastos por debajo, igual y por encima del fondo; primer cierre sin fondo;
  "Debe haber" no cambia; PDF con sobregiro.

**Fase 2 — Tarjeta de la semana (`petty-cash-week-card.tsx`)**
- Cuatro tarjetas (fondo, ingresos en efectivo, gastos, efectivo en caja), línea de tarjeta/
  transferencia, franja de sobregiro, aviso en vivo al escribir el monto y confirmación si supera el
  efectivo en caja.

**Fase 3 — Cierre (`cash-closing-form.tsx`, `/cash/[id]`, `physical-total-hero.tsx`,
`petty-cash-summary.tsx`)**
- Texto del hero, fila de sobregiro, saldo del fondo sin negativo, "Se retira" si P4 = sí.

**Fase 4 — Cierre del trabajo**
- `types.ts`, `docs/data-model.md`, `CHANGELOG.md` bajo `[No liberado]`.
- Tests backend con `--buffer`, lint y build del frontend, recorrido en la app con demo.admin:
  registrar un gasto mayor que el fondo, ver la franja de sobregiro, cerrar la semana y revisar el
  detalle y el PDF.
