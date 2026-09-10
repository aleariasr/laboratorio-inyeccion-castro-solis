# Cierre: migración legacy DBF

Estado: **completada** (2026-09-09).

## Alcance

Se migraron las 4 fuentes DBF que resultaron ser recuperables:

- `INVEN01` (proveedores);
- `INVEN03` (piezas/productos);
- `INVEN05` (compras/facturas);
- `INVEN08` (stock auxiliar, usado como fuente de conciliación final).

`INVEN06` (salidas/ventas) **quedó fuera del alcance a propósito**: se
verificó que está mayormente corrupto en su origen (ver "Hallazgos"
abajo) y no es reconstruible de forma confiable. Como consecuencia, no
se reconstruyó el historial de ventas legacy — solo el estado actual
del inventario y el historial de compras.

## Fuentes originales

El cliente entregó dos copias de los `.DBF`, de procedencia y momento
distintos (no son el mismo export, y las fechas de modificación
internas de cada archivo no coinciden entre sí ni entre carpetas):

- `bases1/` — usada como **fuente principal**.
- raíz — usada **solo para completar códigos ausentes** en `bases1/`
  (proveedores, piezas y stock que existían ahí pero no en `bases1/`).

Regla de fusión: si un código existe en ambas copias, gana el valor de
`bases1/`; los conflictos de valor entre copias quedan documentados
como `MigrationIssue` (categoría `CONFLICTO_ENTRE_COPIAS`), no se
pierden ni se promedian.

Los archivos reales **no viven en el repositorio** (son datos de
negocio del cliente) — ver `backend/legacy_data/` (excluido vía
`.gitignore`).

## Hallazgos técnicos reales

Estos hallazgos surgieron de inspeccionar los `.DBF` byte a byte antes
de diseñar el mapeo — ninguno estaba anticipado en el diseño
conceptual original de `data-model.md`:

1. **`dbfread` (librería externa) cuenta mal los registros** en estos
   archivos: corta la lectura en el primer byte `0x1A` que encuentra,
   tratándolo como fin de archivo, cuando en realidad aparece disperso
   como relleno de registros nunca escritos, con datos reales después.
   Por eso se escribió un lector propio (`apps/legacy_migration/dbf.py`)
   que solo trata `0x1A` como "este registro puntual está vacío", no
   como fin de archivo.
2. **`INVEN06` está genuinamente corrupto**, no es un artefacto de la
   copia: la corrupción es *idéntica byte a byte* en ambas copias
   entregadas. Los primeros ~24 registros son perfectamente legítimos
   (una factura de salida real de 1991), y a partir de ahí el archivo
   alterna entre tramos ilegibles y tramos que vuelven a ser legítimos
   de forma intermitente — un patrón más consistente con una
   reestructuración de registro nunca migrada correctamente en las
   filas viejas que con daño físico de disco simple.
3. **Bug de año de 2 dígitos sin corregir (efecto Y2K)**: las fechas de
   `INVEN05` (y presumiblemente `INVEN06`) anteponen "19" en vez de
   "20" al año de 2 dígitos. Una compra de 2004 quedaba guardada como
   `1904`; una de 2026, como `1926`. Confirmado aplicando "si el año es
   menor a 1950, sumarle 100": el resultado da una distribución de
   compras perfectamente continua desde 1991 hasta 2026 (la fecha de
   hoy). Se corrige de forma determinística en la importación
   (`migrate_legacy_import.py`, `BUGGY_YEAR_THRESHOLD = 1950`).
4. **La ubicación física estaba embebida al final del nombre de la
   pieza**, no en un campo separado: `"CAMISA VALVULA TRASIEGO PERKINS
   354 B147"` es en realidad el nombre `"CAMISA VALVULA TRASIEGO
   PERKINS 354"` con ubicación `B147`. Confirmado con Alejandro contra
   el catálogo real. Regla de confianza implementada
   (`apps/legacy_migration/location.py`):
   - código de 3+ caracteres (ej. `B147`, `D116`) → se acepta siempre;
   - código de 2 caracteres (ej. `E1`, `H3`) → solo se acepta si se
     repite en 2 o más piezas distintas de todo el catálogo (evita
     confundir un número de modelo de motor con una ubicación real).
5. **La misma pieza puede aparecer en dos líneas distintas dentro de la
   misma factura** de `INVEN05` (mismo `NUMFAC_05`+`CODPRO_05`,
   distinto `NUMITE_05`). El modelo real actual solo permite una línea
   por producto por compra (`unique_together` en `PurchaseItem`) — se
   fusionan sumando cantidad y promediando el costo unitario ponderado
   por cantidad, documentado como `MigrationIssue`.

## Decisiones de mapeo confirmadas con Alejandro

- **Ventas (`INVEN06`) descartadas**: no se reconstruye historial de
  salidas. Solo se migra el estado de inventario (proveedores,
  productos, stock) y el historial de compras.
- **Compras sí se reconstruyen** como `Purchase`/`PurchaseItem` reales,
  confirmadas vía `confirm_purchase()` (movimientos `ENTRY` reales,
  con fecha corregida). Moneda siempre `CRC` (colones), ignorando el
  campo en dólares (`PREDOL_05`) que también trae el legacy.
- **Conciliación final**: como no hay ventas históricas para restar,
  el stock que resulta de sumar solo compras casi nunca coincide con
  la realidad. Se corrige con **un único movimiento `ADJUSTMENT`** por
  producto (motivo explícito: "ventas/salidas históricas no
  reconstruibles"), llevando el stock final exactamente al valor de
  `INVEN08` (la fuente de conciliación).
- **Productos sin ubicación detectable**: van a una ubicación
  compartida `SINUB` ("sin ubicar") creada especialmente para esto, en
  vez de dejar el campo vacío (el modelo real no admite un producto
  sin ubicación) o inventar una. Es una lista accionable: filtrando
  por `SINUB` se puede ir asignando ubicación real physicamente.
- **Productos/compras huérfanos** (referencian un código que no existe
  del otro lado): no se crea ningún registro fantasma. Quedan
  documentados como `MigrationIssue` para revisión manual posterior.
- **Datos de proveedor sin campo destino** (`DIRPRO_01`, `FAX_01`):
  como `Supplier` no tiene campos de dirección/fax, no se agregaron
  campos nuevos al modelo — quedan solo en el staging crudo, no en
  ningún campo visible del negocio (decisión explícita: no ampliar el
  modelo real solo para la migración).
- `REFPIE_03` (referencia alterna) y `CANMAX_03` (cantidad máxima): sin
  campo equivalente en el modelo actual, no se migran a ningún campo
  operativo — quedan disponibles en el staging crudo por si hacen
  falta después.

## Arquitectura implementada

Nueva app `apps.legacy_migration`, con tablas propias que nunca
contaminan el modelo de negocio (`MigrationRun`, `LegacyStagingRecord`,
`MigrationIssue`, `LegacyRecordMap`), y 4 management commands que se
corren en orden:

1. `migrate_legacy_extract --bases1 <dir> --root <dir>` — lee los
   `.DBF`, fusiona ambas copias, llena `LegacyStagingRecord`.
2. `migrate_legacy_validate [--run N]` — recorre el staging y genera
   `MigrationIssue` (huérfanos, duplicados, ubicaciones de baja
   confianza, fechas inválidas). No modifica ni crea nada de negocio.
3. `migrate_legacy_import [--run N]` — normaliza e importa de verdad,
   usando exclusivamente los services/selectors ya existentes
   (`confirm_purchase()`, `adjust_stock()`, nunca inserta stock a
   mano). **Idempotente**: se puede volver a correr sin duplicar nada
   si se corta a mitad de camino (cada registro creado queda mapeado
   en `LegacyRecordMap`, y el comando lo detecta en la siguiente
   corrida).
4. `migrate_legacy_report [--run N]` — el reporte final exigido por
   `data-model.md`: totales detectados/importados, huérfanos,
   diferencias de stock, movimientos reconstruidos, errores
   bloqueantes y advertencias — consultando la base real, no
   contadores por-invocación (que subestiman el total si algún paso se
   corrió más de una vez).

Todo con tests (`apps/legacy_migration/tests/`), incluyendo
regresiones específicas para cada bug real encontrado durante la
importación contra los datos reales del cliente.

## Cómo correrlo en producción

`scripts/migrate-legacy-dbf.sh <carpeta-con-los-dbf>` encadena los 4
pasos en un solo comando: valida que estén los 8 archivos esperados,
pide confirmación explícita, crea un respaldo completo de la base
(`scripts/backup.sh manual`) antes de tocar nada, copia los `.DBF`
dentro del contenedor `backend` y corre extracción → validación →
importación → reporte en orden. Es seguro volver a correrlo si algo
falla a mitad de camino (no duplica lo ya importado). La carpeta debe
tener la misma forma que entregó el cliente (`INVEN0X.DBF` sueltos +
subcarpeta `bases1/` con su propia copia).

## Resultado final (verificado 2026-09-09)

| | Detectado | Importado |
|---|---|---|
| Proveedores | 73 | 73 (100%) |
| Productos | 3.655 | 3.655 (100%) |
| Líneas de compra | 13.576 | 12.446 |
| Compras (facturas) | — | 2.079 |

- 1.797 productos sin ubicación confiable → `SINUB`, pendientes de
  ubicar físicamente.
- 1.886 productos requirieron ajuste de conciliación final contra
  `INVEN08`.
- 11.291 fechas corregidas por el bug de año de 2 dígitos.
- 1.130 líneas de compra no se importaron (1.073 piezas huérfanas + 57
  fechas inválidas, con 3 líneas que combinan ambos problemas a la
  vez), todas documentadas.
- **0 errores bloqueantes.**

## Pendientes posteriores (no bloquean, son trabajo operativo normal)

- Revisar la lista de productos en `SINUB` y asignarles ubicación real
  a medida que se van encontrando físicamente en la bodega.
- Revisar los productos huérfanos documentados (referenciados en
  compras o en stock auxiliar pero ausentes del catálogo) por si
  alguno merece darse de alta a mano.
- Si en algún momento aparece una copia más completa o menos corrupta
  de `INVEN06`, se podría reconsiderar reconstruir historial de
  ventas — hoy no es viable con los archivos disponibles.
