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
- `CANMAX_03` (cantidad máxima): sin campo equivalente en el modelo
  actual, no se migra a ningún campo operativo — queda disponible en el
  staging crudo por si hace falta después.
- `REFPIE_03` (referencia alterna): **esta decisión cambió**. En el
  cierre original no se migró a ningún campo operativo. El 12/09/2026,
  después de levantar el tema con la administradora de la empresa, se
  comprobó que sí codifica una relación real de equivalencia entre
  productos, y se migró. Ver "Etapa posterior" al final de este
  documento.

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

---

# Etapa posterior: agrupación de equivalencias (2026-09-12)

Estado: **completada y verificada**.

Esta etapa es posterior al cierre de arriba y corrige una de sus
decisiones. No modifica nada de lo ya migrado: no crea, no borra y no
toca precios, costos, stock, movimientos ni ubicaciones.

## Qué resultó ser `REFPIE_03`

La administradora de la empresa describió el campo como "un código
numérico que apunta al código de otro producto". Medido contra el
catálogo real (3.655 productos), esa descripción es aproximada:

- es un `C(13)` de **texto libre**; solo 334 de 1.661 valores poblados
  son numéricos puros;
- 1.661 productos (45,4%) tienen valor, y solo 666 resuelven a un código
  del catálogo;
- hay **140 pares recíprocos** (A→B y B→A) y **39 ciclos**, con cero
  autorreferencias y un fan-in máximo de 4.

Esos tres últimos datos descartan la lectura de "genérico padre": una
relación padre-hijo no puede ser simétrica ni cíclica. Lo que sí es,
leído como **grupo no dirigido**, es una equivalencia entre filas del
catálogo que representan la misma pieza física comprada a distinto
proveedor o marca. Lo confirman el parecido de nombre (similitud mediana
0,80 entre origen y destino), las 102 fichas que ya traían una
equivalencia escrita a mano con `=<código>` dentro del nombre, y la
convención de códigos: `G3S6` / `KG3S6`, `105017-1790` / `C105017-1790`,
`F-00V-C01-502` / `KF00V-C01-502`.

Corrección al enunciado inicial: el invariante **no** es el precio de
venta sino el costo. El costo difiere en 362 de 392 grupos (97%); el
precio de venta, solo en 212 (57%).

## Cómo se construyen los grupos

Dos mecanismos de enlace, los dos presentes en los datos:

- **A (647 aristas)** — `REFPIE_03` de X es igual al `CODPIE_03` de Y. Es
  el 95% de los enlaces reales.
- **C (30 aristas)** — dos productos comparten el mismo `REFPIE_03` con
  forma de código que no es a su vez un código del catálogo (el "código
  universal" compartido). Existe, pero es el caso minoritario.

Cada arista se valida por separado comparando el nombre sin la ubicación
(similitud ≥ 0,55) y recién después se toman las componentes conexas.
**Validar por arista y no por grupo no es un detalle**: sin eso, el
cierre transitivo une SCV de Toyota, Isuzu y L200 en un mismo grupo a
través de una cadena de referencias.

El canónico del grupo se elige de forma determinista: más referencias
entrantes, luego código más corto (la fila derivada es la que lleva
prefijo), luego alfabético. El resultado no depende del orden de
ejecución; está verificado desordenando la entrada.

Dos trampas que el código evita a propósito:

1. La arista C solo acepta valores con forma de código. `TORNECA` es un
   proveedor (está en `INVEN01`) y pegaba 4 productos sin relación en un
   mismo grupo.
2. 95 aristas se descartan por nombre distinto. Entre ellas hay falsos
   negativos reales (`0-928-400-713` / `1-465-ZS0-082`, los dos ZME de
   CP3 para KIA; `3--177` / `3-177`, que es un typo). Esa lista es para
   revisión humana, nunca para automatizar.
3. **Los grupos de 3 o más no se aplican.** Validar por arista evita las
   uniones absurdas, pero no evita las cadenas plausibles: si A equivale
   a B y B equivale a C, el cierre transitivo los junta a los tres aunque
   A y C no tengan nada que ver. En los datos reales eso produce grupos
   como `RODILLO BOMBA VE` (₡3.000) junto a `RODILLO B. VE SET`
   (₡40.000), o una `PUNTA C.R. HINO` junto a una `VALVULA C.R. KS08`.
   Son 63 grupos y 212 productos. El comando los detecta, los reporta y
   los **excluye**; entrarían solo con `--max-group-size` mayor a 2, y
   eso requiere revisarlos uno por uno con la administradora.

   Los 333 grupos de a dos que sí se aplican tienen 2 casos con
   similitud interna floja, contra 5 de 63 en los grandes.

## Decisión de modelo

No se creó ninguna tabla. El modelo ya lo soportaba: la migración `0023`
le quitó el `unique` a `Product.standard_code`, existe
`Product.variant_kind`, existe `selectors/products.py::variant_family()`
y existe `POST /products/{id}/add-variant`. La §3.6 de
[data-model.md](data-model.md) ya decía que varias filas `Product`
comparten `standard_code` para representar variantes de la misma pieza.

La capacidad estaba construida y vacía: `migrate_legacy_import.py` le da
a cada producto legacy su propio `standard_code = CODPIE_03`. Esta etapa
solo llena los grupos.

| Campo | Qué pasa |
|---|---|
| `standard_code` | pasa a ser el código canónico del grupo |
| `variant_kind` | canónico `ORIGINAL`, el resto `OTHER` |
| `description` | recibe las notas administradas (abajo) |
| precio, costo, stock, movimientos, ubicación, nombre | **sin cambios** |

`variant_kind` de los no canónicos es `OTHER` y no `GENERIC` a
propósito: los datos no dicen cuál de las filas es la genérica.
Reclasificar es trabajo de la administradora desde la UI.

## Qué queda escrito en cada producto

Tres líneas administradas por prefijo, todas buscables (la búsqueda por
`q` de `views/product.py` incluye `description`):

    Código universal compartido: G3S6 — agrupado como variante equivalente
    a partir de la referencia del sistema legacy (REFPIE_03); comparte
    código con: KG3S6.
    Código legacy: KG3S6
    Ubicación propia: SINUB (sin ubicar) — su equivalente C0433-171-074
    está en G102; candidato a ubicar ahí.

A eso se suma una cuarta línea, `Referencia legacy: <valor>`, con el
contenido crudo de `REFPIE_03` **en todo producto que lo tenga, agrupe o
no**. Los 1.118 productos cuya referencia no forma ningún grupo
(números de fabricante Bosch/Denso, notas sueltas, los miembros de los
grupos excluidos) reciben solo esa línea: no cambian de código, de
variante ni de ubicación. Así el dato del legacy queda consultable en vez
de perderse, que era el motivo original por el que este campo había
quedado sin migrar.

El código propio de cada fila va a `description` porque el código que se
ve en pantalla pasa a ser el compartido; sin esa línea, buscar `KG3S6`
dejaría de encontrar la pieza. Todo lo que una persona haya escrito a
mano en ese campo sobrevive al apply y al rollback: las líneas se
reescriben y se borran solo por prefijo.

**`SINUB` no cuenta como ubicación.** Es la marca de "sin ubicar" que
puso la migración anterior, no un estante. Tratarla como una ubicación
más hacía que 107 grupos perfectamente ubicados se reportaran como
"repartidos", con texto engañoso para el mostrador. Excluyéndola, los
grupos repartidos bajan de 259 a 152.

Los productos que quedaron en `SINUB` y tienen un equivalente sí ubicado
reciben en cambio una pista accionable. De los 201 productos `SINUB` que
están en algún grupo: **113 apuntan a un estante concreto**, 11 a varios
candidatos, y 77 no reciben nota porque su grupo entero está sin ubicar.
Eso convierte parte de los 1.797 productos en `SINUB` pendientes de
ubicar en una lista de trabajo para bodega.

## Ubicaciones: qué NO se toca

111 grupos aplicables tienen miembros en ubicaciones reales distintas.
**No se mueve ninguno.** Cada producto se queda donde dice el legacy y el
hecho queda anotado en `description`.

Eso obligó a un cambio de regla de negocio. `ProductSerializer.validate`
rechazaba cualquier cambio de ubicación en un producto con variantes,
con el mensaje "todas deben permanecer en la misma ubicación". Esa regla
se quitó, por dos razones:

1. **Es falsa en este negocio.** 111 familias de equivalentes están
   repartidas en estantes distintos en los datos reales del cliente.
2. **Producía un bloqueo mutuo.** Para mudar una familia unificada había
   que mover al primero, y mover al primero siempre fallaba: una familia
   de variantes no se podía reubicar nunca. El bug ya existía; nadie lo
   había notado porque casi no había familias.

Sin ese cambio, los 100 productos en `SINUB` a los que esta migración
les escribe "su equivalente está en G102, candidato a ubicar ahí" no
habrían podido moverse a G102 desde el sistema. Compartir ubicación
queda como valor por defecto de `add-variant`, no como restricción.

## Resultado (2026-09-12)

Los números dependen de **cuál export de los `.DBF` se cargó en el
staging**. El cliente entregó dos: uno hace meses y otro en septiembre de
2026. El entorno de desarrollo tiene el viejo; la máquina de producción
se migró con el nuevo.

| | Export viejo (dev) | Export nuevo (producción) |
|---|---|---|
| Productos en el catálogo | 3.655 | 3.674 |
| Productos con `REFPIE_03` | 1.661 | 1.671 |
| Grupos detectados | 392 | 396 |
| Grupos **aplicables** (2 miembros) | **330** | **333** |
| Grupos **excluidos** por tamaño | 62 | 63 |
| Productos agrupados | **660** | **666** |
| Productos solo con referencia guardada | 1.113 | 1.118 |
| **Total de productos actualizados** | **1.773** | **1.784** |
| Grupos en varias ubicaciones reales | 112 | 111 |
| Productos `SINUB` con pista de ubicación | 97 | 100 |
| Productos creados o borrados | **0** | **0** |

Estado de verificación, dicho sin adornos:

- La columna de **desarrollo se verifica corriendo el comando y el
  script contra la base real**: idempotencia, rollback exacto y que una
  segunda corrida no crea respaldo.
- La columna de **producción está calculada a partir del export nuevo,
  no verificada contra esa base todavía**. Sirve como control: si el
  `--dry-run` en producción reporta 333 grupos aplicables y 1.784
  productos, el staging de esa máquina corresponde al export nuevo. Si
  reporta 330 y 1.773, corresponde al viejo y hay que revisar antes de
  aplicar.

Suite completa: **603 tests OK**, incluidos 13 nuevos en
`apps/legacy_migration/tests/test_migrate_legacy_equivalences.py`.

## Cómo correrlo en producción

    ./scripts/migrate-legacy-equivalences.sh

**No necesita los archivos `.DBF` ni ninguna ruta.** Lee el staging que
ya dejó `migrate-legacy-dbf.sh` en la base de datos
(`LegacyStagingRecord`). Si el staging no existe, avisa y no hace nada.

Antes hay que **actualizar la aplicación instalada**: en producción el
backend corre desde la imagen (`image: lics-backend:${LICS_VERSION}`, sin
montar el código), así que un comando nuevo no existe dentro del
contenedor que está corriendo hasta que se instala una versión que lo
incluya. El camino es el de siempre, sin `.exe` nuevo: construir el
release en la máquina de desarrollo, copiar la carpeta a `C:\lics-dev\`
en la Windows, y usar el menú **LICS > Actualizar aplicación
(Django/Next)…** de la app. Después, dentro de la distro
(`wsl -d lics-wsl`), correr el script desde `/opt/lics/scripts/`.

Orden, distinto a propósito del de `migrate-legacy-dbf.sh`:

1. valida el entorno y espera a que backend y postgres estén sanos;
2. corre en verificación (`--dry-run`) y muestra el resumen exacto;
3. **si no hay nada pendiente, sale sin crear respaldo y sin tocar
   nada** — volver a correrlo después de una migración exitosa es seguro
   y no deja respaldos basura;
4. pide confirmación explícita;
5. crea un respaldo completo (`scripts/backup.sh manual`) antes de
   escribir una sola fila, y dice dónde quedó;
6. aplica;
7. vuelve a verificar y exige 0 grupos pendientes.

Cada corrida deja un log en `logs/` con timestamp.

Para correrlo contra el stack de desarrollo en vez del productivo hay
que exportar `LICS_COMPOSE_FILE` y `LICS_ENV_FILE` — ver
[development.md](development.md).

## Cómo deshacerlo

    ./scripts/migrate-legacy-equivalences.sh --rollback

Devuelve a cada producto el código legacy con el que se importó y le
limpia las notas administradas. **No necesita el respaldo ni guarda
estado nuevo**: `LegacyRecordMap` ya mapea
`(INVEN03, CODPIE_03) → Product.pk` bajo una constraint única, así que
el código original nunca se perdió. Los productos que alguien haya
cambiado a mano después no se tocan.

## Idempotencia

Un grupo se considera ya migrado si, y solo si, **todos** los `Product`
mapeados desde sus códigos ya están exactamente en el estado deseado
(`standard_code`, `variant_kind` y `description`). Esa condición se
deriva solo del contenido del staging y de la ubicación actual de cada
producto: no depende del orden en que se procesaron los grupos ni de
cuántas veces se corrió el comando. Correrlo dos veces seguidas deja el
mismo estado, y una corrida cortada a la mitad retoma exactamente los
grupos que faltaban.

## Pendientes de esta etapa

- **Los 63 grupos excluidos por encadenamiento** (212 productos) siguen
  sin agruparse. Es la lista corta que vale la pena revisar con la
  administradora; con su visto bueno se aplican subiendo
  `--max-group-size`, o a mano desde la UI.
- Revisar las 95 aristas descartadas por nombre distinto: hay
  equivalentes reales ahí.
- La referencia cruda queda en `description`, que es buscable, pero
  sigue sin campo propio. Los ~776 números de fabricante (Bosch/Denso)
  se pueden encontrar con la búsqueda general; un campo dedicado y un
  filtro propio quedan como mejora posterior.
- Los dos entornos tienen exports distintos de los `.DBF`: producción se
  migró con el export de septiembre de 2026 (3.674 productos) y
  desarrollo sigue con el anterior (3.655). La diferencia son 19
  productos y 142 filas con algún campo cambiado. No bloquea nada, pero
  hasta que desarrollo se ponga al día los números de una corrida local
  no van a coincidir con los de producción.
