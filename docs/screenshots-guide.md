# Guía de capturas de pantalla para el README

Este documento explica **qué capturas tomar, en qué estado, con qué nombre de
archivo y dónde colocarlas** para completar la galería de "Capturas del
sistema" del [README principal](../README.md). No es documentación de
producto: es una guía de trabajo de una sola vez (y para repetir cuando el
sistema cambie visualmente lo suficiente como para que las capturas queden
desactualizadas).

---

## Reglas generales

1. **Carpeta destino:** `docs/images/screenshots/` (todavía no existe —
   se crea sola al guardar el primer archivo ahí).
2. **Formato:** PNG. No JPG (el texto y los bordes de la interfaz se ven
   nítidos solo en PNG).
3. **Nombre de archivo:** exactamente como se indica en la tabla de abajo —
   minúsculas, sin tildes, sin espacios, con guiones. GitHub distingue
   mayúsculas/minúsculas, así que un nombre distinto rompe la imagen en el
   README.
4. **Resolución:** ventana del navegador ancha (recomendado 1600×900 o
   similar, proporción 16:9), zoom del navegador al 100%. Usá el mismo
   ancho de ventana para todas las capturas — la galería se ve mucho más
   prolija cuando todas tienen las mismas proporciones.
5. **Qué recortar:** solo el contenido de la aplicación (la ventana del
   navegador o de la app de escritorio), sin la barra de direcciones ni el
   fondo del escritorio. Excepción: la captura de la app de escritorio de
   Windows (`app-escritorio-windows.png`), donde sí conviene mostrar la
   ventana nativa completa (con su barra de título), porque ahí lo que se
   quiere demostrar es justamente que es una app de escritorio real.
6. **Datos sensibles:** este repositorio puede compartirse o hacerse
   público en el futuro. Antes de capturar pantallas con datos de clientes
   reales:
   - Preferí usar datos de prueba (`Cliente de prueba`, `Producto de
     prueba`, etc.) cuando sea posible, o
   - Si usás datos reales de la máquina de pruebas, tapá o difuminá
     nombres completos, números de identificación, teléfonos y montos de
     ventas reales antes de guardar el archivo.
7. **Estado de los datos:** ninguna pantalla debería verse vacía. Antes de
   capturar, asegurate de tener al menos: un puñado de productos (alguno
   con variantes), un proveedor, una compra confirmada, una venta
   confirmada, un cliente con un inyector y un servicio, y un cierre de
   caja ya hecho — así todas las pantallas de detalle tienen contenido real
   que mostrar en vez de estados vacíos.

---

## Lista de capturas

Las marcadas con ⭐ son las más importantes — si hay poco tiempo, empezar
por esas cubre lo esencial del sistema.

### 1. Acceso y panel principal

| Ruta | Qué mostrar | Archivo |
|---|---|---|
| `/login` | Formulario de inicio de sesión, vacío o con el usuario ya escrito (sin la contraseña visible). | ⭐ `login.png` |
| `/dashboard` | Panel de inicio con datos reales: al menos un servicio listo, un producto bajo mínimo, algún borrador de venta o compra, y la sección "Vistos recientemente" con varias tarjetas (para eso, navegá por 5-6 pantallas distintas antes de volver al dashboard). | ⭐ `dashboard.png` |
| `/search` (atajo de teclado o barra de búsqueda) | Resultado de una búsqueda que traiga coincidencias en varias categorías a la vez (por ejemplo, un texto que aparezca en un producto, un cliente y una venta). | ⭐ `busqueda-universal.png` |

### 2. Inventario

| Ruta | Qué mostrar | Archivo |
|---|---|---|
| `/inventory/products` | Listado de productos con varias filas y al menos un filtro aplicado. | ⭐ `productos-listado.png` |
| `/inventory/products/[id]` | Detalle de un producto que **tenga variantes** (para que se vea la sección "Variantes de este código" — el rediseño de §3.6). | ⭐ `producto-detalle-variantes.png` |
| `/inventory/locations` | Listado de ubicaciones físicas. | `ubicaciones-listado.png` |
| `/inventory/movements` | Movimientos de inventario filtrados por un solo producto (modo kardex, con saldo corriente visible). | `movimientos-inventario.png` |
| `/inventory/counts` | Listado de conteos físicos, o el detalle de uno con líneas capturadas y alguna diferencia visible contra el stock del sistema. | `conteos-fisicos.png` |

### 3. Compras

| Ruta | Qué mostrar | Archivo |
|---|---|---|
| `/inventory/purchases/[id]` | Detalle de una compra confirmada, con sus líneas. | `compra-detalle.png` |
| Dentro del detalle de una compra, resumen de costos | Resumen de costos de importación con el desglose por producto. | `costos-importacion.png` |

### 4. Ventas

| Ruta | Qué mostrar | Archivo |
|---|---|---|
| `/sales` | Listado de ventas con filtros aplicados. | ⭐ `ventas-listado.png` |
| `/sales/[id]` | Detalle de una venta confirmada, con sus líneas, método de pago y el botón de descarga de factura interna visible. | ⭐ `venta-detalle.png` |

### 5. Clientes y servicio técnico

| Ruta | Qué mostrar | Archivo |
|---|---|---|
| `/customers/[id]` | Detalle de un cliente con sus inyectores y ventas relacionadas visibles. | `cliente-detalle.png` |
| `/services` | Bandeja operativa de servicios, con órdenes en distintos estados (recibido, en proceso, listo). | ⭐ `servicios-bandeja.png` |
| `/services/[id]` | Detalle de un servicio entregado, con precio, accesorios usados y el botón de factura interna. | ⭐ `servicio-detalle.png` |

### 6. Caja

| Ruta | Qué mostrar | Archivo |
|---|---|---|
| `/cash/new` | Formulario de creación de cierre, con la previsualización del desglose por método de pago ya cargada (efectivo/tarjeta/transferencia/otro + total). | ⭐ `cierre-caja-nuevo.png` |
| `/cash/[id]` | Detalle de un cierre ya confirmado, con el mismo desglose por método de pago guardado como dato histórico. | ⭐ `cierre-caja-detalle.png` |

### 7. Reportes y documentos

| Ruta | Qué mostrar | Archivo |
|---|---|---|
| `/reports` | Galería de los 8 reportes disponibles. | `reportes-galeria.png` |
| Cualquier reporte, por ejemplo `/reports/sales-by-date` | Un reporte abierto con resultados reales (no vacío). | `reporte-ejemplo.png` |
| Descarga de factura interna (venta o servicio) | El PDF de una factura interna abierto en el visor del navegador o del sistema. | `factura-pdf.png` |
| Proforma generada desde el listado de productos | El PDF de una proforma abierto. | `proforma-pdf.png` |
| Etiqueta de producto | El PDF de una etiqueta con su código de barras Code128. | `etiqueta-pdf.png` |

### 8. Administración

| Ruta | Qué mostrar | Archivo |
|---|---|---|
| `/users` | Listado de usuarios del sistema. | `usuarios-listado.png` |
| `/system/status` | Pantalla administrativa de estado del sistema. | `estado-sistema.png` |

### 9. App de escritorio (Windows)

| Dónde | Qué mostrar | Archivo |
|---|---|---|
| La máquina Windows con LICS instalado | La ventana nativa de la app de escritorio (Electron) abierta y mostrando el dashboard, con su barra de título visible — para demostrar que es una app de escritorio real, no solo una pestaña de navegador. | ⭐ `app-escritorio-windows.png` |

---

## Cómo se usan estas imágenes

El README ya tiene los `![...]` apuntando a estas rutas exactas dentro de
`docs/images/screenshots/`. Mientras un archivo no exista, GitHub muestra un
ícono de imagen rota en su lugar — no rompe nada, simplemente esa captura
falta. Se pueden ir agregando de a poco; no hace falta completarlas todas de
una sola vez.
