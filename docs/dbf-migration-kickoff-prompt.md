Trabajás en LICS, un sistema de gestión para un laboratorio de inyección
diésel (`/Users/alejandroarias/VisualStudioCode/laboratorio-inyeccion-castro-solis`),
backend Django REST Framework + frontend Next.js. Ya tengo los archivos DBF
reales (o muestras representativas) del sistema legacy que hay que migrar —
te los voy a compartir en este chat.

## Antes de empezar, leé esto (en este orden)

1. `docs/data-model.md`, sección "Migración legacy DBF" — el diseño
   conceptual ya pensado: flujo (extracción → staging → validación →
   normalización → importación → conciliación), las entidades técnicas
   propuestas (`MigrationRun`, `LegacyRecordMap`, `MigrationIssue`) y las
   fuentes legacy identificadas (`INVEN01` proveedores, `INVEN03`
   piezas/productos, `INVEN05` compras/facturas, `INVEN06` salidas/ventas,
   `INVEN08` stock auxiliar). Es un diseño conceptual, no verificado
   todavía contra archivos reales — tratalo como punto de partida, no como
   verdad cerrada.
2. `docs/roadmap.md`, "Fase 10: migración legacy DBF" — mismo flujo, regla
   importante: los códigos legacy no deben contaminar el modelo principal,
   deben vivir en tablas/estructuras de migración aparte.
3. El modelo real actual de `apps/inventory`, `apps/customers`, `apps/sales`
   (backend/src/apps/) — no asumas que el modelo conceptual del punto 1
   coincide exactamente con el código de hoy; verificalo leyendo los
   modelos reales antes de diseñar el mapeo.
4. `docs/roadmap.md` completo y `README.md` para contexto general del
   estado del proyecto (ya está en 2.0.0, backend y frontend operativos
   completos, este es el único bloque de trabajo grande que faltaba
   desbloquear).

## Reglas de esta sesión (no negociables, establecidas por el usuario)

1. **Verificá contra el código real antes de tocar nada** — no asumas que
   la documentación conceptual describe el código actual con exactitud.
2. **Vos editás archivos directamente (Write/Edit), pero el usuario corre
   todos los comandos de shell** (migraciones, tests, scripts de
   importación, cualquier cosa que toque la base de datos) — nunca los
   corrás vos mismo. Dale el comando exacto y esperá que él lo corra y te
   pegue la salida.
3. **No toques nada que no se te haya pedido explícitamente** para esta
   tarea — este chat es solo para la migración DBF, no para otros
   pendientes del backlog.
4. **El usuario hace todos los `git add`/`git commit`** — vos no committeás.
5. **Explicá cualquier migración de Django (schema) a fondo antes de que
   la corra**: qué hace, qué riesgo de datos tiene. El sistema todavía no
   está en producción con datos reales de negocio, así que el riesgo de
   *este* entorno es bajo — pero los datos legacy que vas a importar SÍ son
   reales del negocio, tratalos con el cuidado correspondiente (nunca
   insertarlos directo al modelo final sin pasar por staging/validación).

## Qué tenés que hacer primero, antes de escribir código

1. Pedime que te comparta los archivos DBF (o una muestra) si todavía no
   los tenés en el chat.
2. **Inspeccioná la estructura real de esos archivos** (campos, tipos,
   codificación de caracteres, cantidad de filas, valores nulos/basura)
   antes de diseñar nada — no asumas que coinciden con lo que dice
   `data-model.md`. Si podés leerlos directamente (¿en qué formato me los
   vas a pasar? ¿.dbf binario, un dump en CSV/texto, capturas de pantalla
   de la estructura?), hacelo vos mismo; si no podés leer `.dbf`
   directamente, pedime que te dé un volcado en un formato que sí puedas
   leer (por ejemplo, corriendo `dbf2csv` o similar yo mismo, o el
   resultado de abrirlos en algo como `dbfread`/`pandas`), y dame el
   comando exacto si necesitás que yo corra algo.
3. Con la estructura real confirmada, proponeme el diseño concreto de
   mapeo (qué campo DBF va a qué campo del modelo actual, qué pasa con
   registros huérfanos/inconsistentes, cómo se reconcilia el stock final)
   **antes de implementar nada** — quiero revisarlo y confirmarlo primero,
   especialmente cualquier decisión sobre qué hacer con datos
   inconsistentes o bloqueantes.
4. Preguntame explícitamente (no asumas) sobre cualquier regla de negocio
   ambigua que encuentres en los datos reales — por ejemplo: cómo tratar
   productos referenciados en una compra/venta legacy que no existen en el
   catálogo, qué hacer si el stock calculado no coincide con `INVEN08`,
   cómo mapear proveedores o clientes duplicados, qué rango de fechas es
   válido, cómo tratar montos en una moneda no clara.

## Entregable esperado (según el diseño de `data-model.md`)

- Staging: cargar los datos crudos en una estructura intermedia antes de
  tocar el modelo principal.
- Validación: codificación, tipos, fechas, montos, relaciones.
- `MigrationIssue`: registrar cada inconsistencia encontrada (producto
  referenciado que no existe, proveedor faltante, stock distinto entre
  fuentes, fecha/monto inválido, código duplicado, dato ilegible,
  relación incompleta) — la migración solo se aprueba cuando los errores
  bloqueantes estén resueltos o documentados formalmente, no se ignoran.
- `LegacyRecordMap`: trazabilidad completa entre cada registro legacy y el
  registro nuevo que generó, sin contaminar el modelo principal con
  campos legacy.
- Importación real de proveedores, productos, compras, ventas y
  movimientos — usando los services/serializers ya existentes del backend
  cuando aplique (no bypasear las reglas de negocio que ya existen, por
  ejemplo `StockMovement.create_from_service()` para generar movimientos
  de inventario, no insertar filas de stock a mano).
- Conciliación de stock final contra `INVEN08`.
- Reporte de migración: totales detectados e importados por entidad,
  huérfanos, diferencias de stock, movimientos reconstruidos, errores
  bloqueantes, advertencias no bloqueantes.

No implementes nada de esto de una sola vez — andá paso a paso (extracción
→ staging → validación antes de normalizar, normalización antes de
importar), confirmando conmigo en los puntos de decisión reales, no solo
al final.
