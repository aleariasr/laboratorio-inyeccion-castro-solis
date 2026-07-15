# Auditoría previa al frontend

## Proyecto

Laboratorio de Inyección Castro Solís — LICS

## Estado de la auditoría

En progreso.

## Objetivo

Revisar integralmente el backend, la infraestructura, la documentación y los requerimientos operativos antes de diseñar e implementar el frontend.

Esta auditoría busca evitar:

- pantallas desconectadas de los procesos reales;
- componentes visuales inconsistentes;
- funcionalidades omitidas;
- duplicación de lógica;
- flujos lentos para usuarios frecuentes;
- problemas de rendimiento con datos reales;
- decisiones basadas en documentación desactualizada;
- ampliaciones innecesarias del backend.

El frontend debe construirse como software empresarial de producción, no como una demostración visual.

---

# Principios del frontend

La interfaz debe ser:

- intuitiva para usuarios nuevos;
- rápida para usuarios experimentados;
- completamente usable con teclado;
- usable con ratón;
- compatible con lectores de código de barras que funcionen como entrada de teclado;
- sobria;
- moderna;
- uniforme;
- accesible;
- clara;
- eficiente en computadoras antiguas;
- funcional sin conexión a internet;
- fácil de mantener;
- fácil de probar;
- fácil de documentar.

La velocidad operativa del sistema anterior basado en MS-DOS debe conservarse mediante una interfaz moderna que permita navegación rápida con teclado.

No se replicará visualmente MS-DOS. Se conservarán sus ventajas operativas:

- pocos pasos;
- foco predecible;
- navegación rápida;
- confirmaciones claras;
- acciones accesibles por teclado;
- alta densidad de información sin perder legibilidad.

---

# Metodología de implementación

Cada bloque del frontend seguirá este proceso:

1. Revisar el proceso de negocio.
2. Revisar modelos, serializers, vistas, permisos y endpoints.
3. Identificar pendientes backend necesarios.
4. Diseñar el flujo de usuario.
5. Definir componentes reutilizables.
6. Implementar manualmente en VS Code.
7. Ejecutar lint.
8. ejecutar TypeScript y build.
9. Ejecutar pruebas automatizadas.
10. Validar manualmente en navegador.
11. Validar navegación con teclado.
12. Validar errores, cargas y estados vacíos.
13. Documentar el cambio.
14. Crear un commit pequeño y descriptivo.
15. Enviar el cambio a GitHub.

No se implementarán múltiples módulos de una sola vez.

---

# Estado técnico del frontend

Tecnologías actuales:

- Next.js 16;
- React 19;
- TypeScript;
- Tailwind CSS 4;
- App Router;
- salida standalone para producción;
- Docker;
- Nginx como punto único de entrada.

El frontend actual todavía corresponde a la plantilla inicial de Next.js.

Archivos existentes:

- `frontend/src/app/layout.tsx`;
- `frontend/src/app/page.tsx`;
- `frontend/src/app/globals.css`;
- `frontend/src/app/favicon.ico`.

La compilación productiva fue validada después de eliminar la asignación manual incorrecta de `NODE_ENV=development` del Dockerfile.

Validaciones actuales:

- `npm run lint`: OK;
- `npm run build`: OK;
- compilación TypeScript: OK;
- prerenderizado: OK;
- imagen Docker: OK.

---

# Autenticación

Endpoints disponibles:

- `POST /api/accounts/login/`;
- `POST /api/accounts/logout/`;
- `GET /api/accounts/me/`;
- CRUD administrativo de usuarios.

El login devuelve:

- token;
- datos del usuario;
- grupos o roles;
- estado activo;
- indicadores administrativos.

Roles actuales:

- `ADMIN`;
- `INVENTORY`;
- `SALES`;
- `CUSTOMERS`;
- `READ_ONLY`.

El backend debe seguir siendo la autoridad para permisos. El frontend puede ocultar o deshabilitar acciones, pero nunca debe asumir que eso sustituye la validación del servidor.

## Pendiente detectado

La API de usuarios devuelve los grupos asignados, pero los serializers actuales de creación y actualización no permiten asignar grupos.

Antes de implementar la administración completa de usuarios será necesario agregar una forma controlada de:

- consultar roles disponibles;
- asignar roles;
- retirar roles;
- validar que solo un administrador pueda hacerlo.

---

# Paginación y rendimiento

Django REST Framework tiene paginación global configurada para los listados de los `ViewSet`.

Antes de esta implementación, los listados podían devolver todos los registros:

- productos;
- ubicaciones;
- compras;
- ventas;
- clientes;
- inyectores;
- servicios;
- costos;
- conteos;
- usuarios.

Esto representa un riesgo real para producción, especialmente en una computadora antigua.

La paginación uniforme del backend fue implementada antes de construir los listados principales.

La respuesta paginada deberá permitir al frontend conocer:

- cantidad total;
- página actual;
- siguiente página;
- página anterior;
- resultados.

Las pruebas existentes fueron actualizadas para consumir el formato paginado. Las acciones personalizadas que devuelven resultados calculados conservan su contrato específico.

---

# Búsqueda universal

Endpoint actual:

- `GET /api/search/?q=texto`.

La búsqueda requiere al menos dos caracteres y devuelve hasta diez resultados por categoría.

Categorías actuales:

- productos;
- ubicaciones;
- referencias de producto;
- proveedores;
- compras;
- clientes;
- inyectores.

## Limitaciones detectadas

Actualmente la búsqueda es más limitada que el requerimiento funcional original.

Productos:

- busca por código estándar;
- no busca todavía por nombre;
- no busca todavía por descripción.

Referencias:

- busca por código de referencia.

Proveedores:

- busca por nombre.

Compras:

- busca por número de factura.

Clientes:

- busca por nombre;
- no busca todavía por identificación;
- no busca todavía por teléfono.

Inyectores:

- busca por número.

No incluye actualmente:

- ventas;
- servicios de inyector;
- referencias de proveedor;
- fabricantes de forma integral.

La búsqueda global será una función principal de productividad y deberá revisarse antes de implementar su interfaz definitiva.

---

# Productos y ubicaciones

## Producto

Campos expuestos:

- identificador;
- código estándar;
- nombre;
- descripción;
- ubicación;
- detalle de ubicación;
- stock mínimo;
- unidad de medida;
- stock actual;
- estado activo;
- fechas de creación y actualización.

El stock actual es de solo lectura y se calcula desde movimientos.

Filtros implementados para productos:

- búsqueda `q` por código estándar;
- búsqueda `q` por nombre;
- búsqueda `q` por descripción;
- búsqueda `q` por código de ubicación;
- filtro exacto por ubicación;
- filtro por estado activo o inactivo.

## Ubicación

Campos expuestos:

- identificador;
- código;
- descripción;
- estado activo.

Filtros implementados para ubicaciones:

- búsqueda `q` por código;
- búsqueda `q` por descripción;
- filtro por estado activo o inactivo.

## Referencias alternativas

Campos expuestos:

- producto;
- fabricante;
- código de referencia;
- descripción;
- estado activo.

Filtros implementados para referencias:

- búsqueda `q` por código de referencia;
- búsqueda `q` por fabricante;
- búsqueda `q` por descripción;
- búsqueda `q` por código o nombre del producto;
- filtro exacto por producto;
- filtro por estado activo o inactivo.

## Implicaciones de interfaz

La pantalla de productos deberá mostrar claramente:

- código;
- nombre;
- ubicación;
- stock actual;
- stock mínimo;
- estado;
- referencias relacionadas.

El stock nunca debe editarse desde el formulario de producto.

Los cambios de stock deben dirigir al usuario hacia:

- compras;
- ventas;
- conteos físicos;
- movimientos o ajustes permitidos.

## Proveedores y relaciones proveedor-producto

Filtros implementados para proveedores:

- búsqueda `q` por nombre;
- búsqueda `q` por contacto;
- búsqueda `q` por teléfono;
- búsqueda `q` por correo;
- búsqueda `q` por país;
- filtro por estado activo o inactivo.

Filtros implementados para relaciones proveedor-producto:

- búsqueda `q` por referencia del proveedor;
- búsqueda `q` por fabricante;
- búsqueda `q` por proveedor;
- búsqueda `q` por código o nombre del producto;
- filtro exacto por proveedor;
- filtro exacto por producto;
- filtro por proveedor preferido;
- filtro por estado activo o inactivo.

Los parámetros booleanos aceptan únicamente `true` o `false`.
Los identificadores de relaciones deben ser enteros positivos.

---

# Compras

Estados:

- `DRAFT`;
- `CONFIRMED`;
- `CANCELLED`.

Campos principales:

- proveedor;
- número de factura;
- fecha;
- moneda;
- tipo de cambio;
- estado;
- auditoría de confirmación;
- auditoría de anulación;
- motivo de anulación;
- notas;
- líneas.

Campos de línea:

- referencia proveedor-producto;
- cantidad;
- costo unitario;
- subtotal calculado.

Acciones:

- confirmar;
- anular;
- calcular costos;
- consultar resumen de costos.

Reglas relevantes:

- solo una compra en borrador puede editarse;
- solo líneas de una compra en borrador pueden editarse;
- documentos confirmados o anulados no pueden eliminarse;
- al confirmar se generan entradas de inventario;
- al anular una compra confirmada se generan movimientos de reversión;
- el motivo de anulación es obligatorio;
- la anulación debe conservar la trazabilidad.

## Implicaciones de interfaz

La compra debe implementarse como un flujo de documento:

1. crear encabezado;
2. agregar líneas;
3. revisar totales;
4. agregar costos asociados cuando corresponda;
5. confirmar mediante una acción explícita;
6. mostrar el documento como solo lectura después de confirmarlo;
7. permitir anulación únicamente mediante diálogo con motivo obligatorio.

No debe implementarse como formularios CRUD independientes sin contexto.

---

# Costos de importación

Entidades disponibles:

- categorías de costos;
- costos asociados a compras;
- resumen de costos;
- histórico de costos por producto.

El histórico de costos es de solo lectura y append-only.

El frontend deberá diferenciar claramente:

- datos editables de una compra en borrador;
- cálculo temporal;
- cálculo confirmado;
- histórico inmutable.

No debe permitir al usuario sobrescribir registros históricos.

---

# Ventas

Estados:

- `DRAFT`;
- `CONFIRMED`;
- `CANCELLED`.

Campos principales:

- cliente opcional;
- fecha;
- moneda;
- tipo de cambio;
- estado;
- auditoría;
- motivo de anulación;
- notas;
- líneas.

Campos de línea:

- producto;
- cantidad;
- precio unitario;
- subtotal.

Reglas:

- solo borradores pueden editarse;
- documentos confirmados o anulados no pueden eliminarse;
- confirmar genera salidas de inventario;
- no se permite confirmar si el stock es insuficiente;
- anular una venta confirmada repone el inventario mediante reversión;
- el motivo de anulación es obligatorio.

## Alcance actual

El módulo es de ventas, no de caja.

Todavía no existen requerimientos confirmados para:

- forma de pago;
- efectivo;
- transferencia;
- vuelto;
- crédito;
- cuentas por cobrar;
- cierres;
- arqueos;
- comprobantes;
- caja diaria.

La interfaz no debe presentar el módulo como “Caja” o “Punto de venta” hasta definir esos requerimientos.

---

# Conteos físicos

Estados:

- `DRAFT`;
- `APPROVED`;
- `CANCELLED`.

Campos:

- referencia;
- fecha;
- estado;
- notas;
- líneas de productos y cantidades contadas.

Acción crítica:

- aprobar.

Reglas:

- el conteo en borrador puede editarse;
- las líneas del borrador pueden editarse;
- al aprobar se generan ajustes por diferencias;
- conteos aprobados o anulados no pueden editarse ni eliminarse;
- sus líneas tampoco pueden eliminarse.

## Implicaciones de interfaz

La pantalla debe priorizar captura rápida:

- búsqueda o escaneo del producto;
- entrada inmediata de cantidad;
- navegación por teclado;
- prevención de productos duplicados;
- revisión de diferencias antes de aprobar;
- confirmación explícita antes de generar ajustes.

---

# Clientes

Campos principales:

- tipo de cliente;
- nombre visible;
- identificación;
- teléfono;
- correo;
- notas;
- estado activo.

El listado de clientes ya permite búsqueda mediante parámetro `q`.

La interfaz deberá permitir encontrar clientes rápidamente por datos operativos, pero la búsqueda backend todavía debe revisarse para incluir identificación y teléfono.

---

# Inyectores y servicios

Estados del servicio:

- `RECEIVED`;
- `IN_PROGRESS`;
- `READY`;
- `DELIVERED`;
- `CANCELLED`.

Acciones:

- iniciar;
- marcar listo;
- entregar;
- anular.

Datos del servicio:

- inyector;
- cliente relacionado;
- fecha de recepción;
- fecha de entrega;
- resistencia;
- fuga;
- notas antes;
- notas después;
- observaciones;
- accesorios;
- estado.

## Implicaciones de interfaz

El módulo no debe diseñarse como un CRUD genérico.

Se recomienda una bandeja operativa con:

- servicios recibidos;
- servicios en proceso;
- servicios listos;
- servicios entregados;
- servicios anulados.

Cada servicio debe mostrar únicamente las acciones válidas para su estado actual.

---

# Reportes

Reportes JSON actuales:

- productos bajo mínimo;
- stock por ubicación;
- movimientos por producto;
- compras por proveedor;
- ventas por fecha;
- productos más vendidos.

Filtros actuales:

- producto;
- fecha inicial;
- fecha final.

## Pendientes

Se debe revisar:

- formato de respuestas;
- totales incluidos;
- comportamiento sin datos;
- validación de fechas;
- posibilidad de exportación;
- impresión;
- rendimiento con datos reales.

Los reportes deben conservar una organización técnica separada de búsqueda y documentos.

---

# Documentos

Documento inicial disponible:

- etiquetas de producto en PDF.

La etiqueta incluye:

- código de ubicación;
- código de barras Code128;
- código estándar;
- nombre;
- descripción corta.

Pendientes de validación real:

- catálogo interno;
- productos bajo mínimo;
- compras;
- ventas;
- recepción de inyector;
- entrega de inyector;
- comparación de precios;
- historial de movimientos.

No se crearán todos los PDF por suposición.

---

# Estado del sistema

Endpoint:

- `GET /api/system/status/`.

El endpoint es exclusivamente administrativo.

Pueden consultarlo:

- usuarios superadministradores;
- usuarios con `is_staff`;
- usuarios pertenecientes al grupo `ADMIN`.

Un usuario autenticado sin privilegios administrativos recibe
`403 Forbidden`.

Información esperada:

- estado general de respuesta de la aplicación;
- versión instalada;
- hora del servidor;
- nombre del entorno;
- estado de `DEBUG`;
- usuario autenticado;
- grupos;
- módulos disponibles.

La respuesta no expone el módulo interno de configuración de Django.

Debe usarse para una pantalla administrativa y para diagnóstico. No sustituye
el healthcheck técnico `GET /api/health/`.

---

# Navegación preliminar

La navegación propuesta es:

## Inicio

- resumen operativo;
- alertas;
- accesos frecuentes;
- estado básico.

## Inventario

- productos;
- ubicaciones;
- conteos físicos;
- existencias;
- movimientos.

## Compras

- compras;
- proveedores;
- referencias proveedor-producto;
- costos de importación;
- histórico de costos.

## Ventas

- nueva venta;
- historial de ventas.

## Clientes y servicio

- clientes;
- inyectores;
- servicios;
- accesorios.

## Reportes

- reportes disponibles.

## Documentos

- etiquetas;
- documentos futuros validados.

## Administración

- usuarios;
- configuración;
- estado del sistema.

La visibilidad deberá adaptarse a los permisos del usuario.

---

# Sistema de diseño requerido

Antes de construir módulos se debe definir una biblioteca de componentes internos.

Componentes mínimos:

- `Button`;
- `IconButton`;
- `Input`;
- `Textarea`;
- `Select`;
- `Checkbox`;
- `Field`;
- `FormError`;
- `StatusBadge`;
- `Alert`;
- `Dialog`;
- `ConfirmDialog`;
- `Table`;
- `Pagination`;
- `SearchInput`;
- `EmptyState`;
- `LoadingState`;
- `ErrorState`;
- `PageHeader`;
- `Section`;
- `Card`;
- `Toolbar`;
- `KeyboardShortcut`;
- `AppShell`;
- `Sidebar`;
- `Topbar`.

Todos los módulos deberán reutilizar estos componentes.

No se permitirá que cada pantalla invente estilos, espaciados, botones, tablas o diálogos diferentes.

---

# Navegación con teclado

La interfaz deberá permitir:

- orden de tabulación lógico;
- foco visible;
- apertura rápida de búsqueda;
- selección con flechas;
- confirmación segura con teclado;
- cierre de diálogos con `Escape`;
- acciones rápidas sin bloquear la escritura normal;
- lectores de códigos de barras;
- retorno del foco al campo operativo después de una acción.

Atajos preliminares:

- `/` o `Ctrl+K`: búsqueda global;
- `Alt+N`: crear nuevo registro;
- `Ctrl+S`: guardar borrador;
- `Escape`: cerrar o cancelar;
- flechas: recorrer resultados;
- `Enter`: seleccionar o ejecutar acciones seguras.

Los atajos deberán mostrarse visualmente y no interferir con campos de texto.

---

# Accesibilidad

Requisitos mínimos:

- HTML semántico;
- etiquetas asociadas a cada campo;
- foco visible;
- contraste suficiente;
- navegación completa con teclado;
- mensajes de error vinculados a los campos;
- estados que no dependan solamente del color;
- botones con nombres comprensibles;
- diálogos accesibles;
- tablas con encabezados;
- idioma principal `es`;
- respeto por reducción de movimiento;
- tamaños de texto legibles;
- áreas interactivas suficientemente grandes.

---

# Pendientes backend previos o paralelos al frontend

Pendientes confirmados:

1. Paginación uniforme implementada.
2. Filtros básicos de catálogos de inventario implementados.
3. Revisar filtros de compras, ventas, clientes, servicios, conteos y costos.
4. Ampliar la búsqueda universal según requerimientos confirmados.
5. Permitir administración controlada de roles de usuario.
6. Revisar permisos cruzados necesarios entre módulos.
7. Actualizar documentación desactualizada.
8. Limpiar imports duplicados en `customers/views.py`.
9. Confirmar qué endpoints necesitan ordenamiento configurable.
10. Confirmar qué listados adicionales requieren búsqueda propia.
11. Mantener cerrados los módulos de caja y migración hasta tener requerimientos reales.

---

# Desajustes documentales detectados

La documentación actual todavía contiene información anterior a los cambios recientes.

Debe actualizarse:

- número de pruebas backend: 269;
- anulación de compras confirmadas;
- reversión de movimientos;
- anulación de ventas confirmadas;
- protección de eliminación;
- conteos físicos implementados;
- tipos actuales de movimiento;
- estado real del backend.

La documentación debe reflejar el comportamiento actual antes de servir como referencia para el frontend.

---

# Criterio para comenzar implementación visual

No se comenzará la implementación de pantallas hasta completar:

- esta auditoría;
- roadmap del frontend;
- sistema de diseño;
- estrategia de autenticación;
- estrategia del cliente API;
- paginación implementada y validada;
- estructura inicial de carpetas;
- reglas de teclado y accesibilidad;
- actualización documental mínima.

Una vez completado lo anterior, el primer bloque funcional será:

1. estructura base;
2. login;
3. sesión;
4. logout;
5. protección de rutas;
6. pantalla de estado del sistema.
---

# Trabajo backend diferido durante la implementación del frontend

Los siguientes cambios no bloquean el inicio de la base técnica del frontend.

Se implementarán cuando se construya el listado correspondiente, para evitar
agregar filtros sin validar primero las necesidades reales de la interfaz.

## Compras

Pendientes previstos:

- búsqueda `q` por número de factura y nombre del proveedor;
- filtro exacto por proveedor;
- filtro por estado;
- filtro por moneda;
- filtro por fecha inicial;
- filtro por fecha final;
- filtro por estado activo o inactivo;
- validación del rango de fechas;
- revisión de ordenamiento configurable.

## Ventas

Pendientes previstos:

- búsqueda `q` por nombre, identificación o teléfono del cliente;
- filtro exacto por cliente;
- filtro por estado;
- filtro por moneda;
- filtro por fecha inicial;
- filtro por fecha final;
- filtro por estado activo o inactivo;
- validación del rango de fechas;
- revisión de ordenamiento configurable.

## Clientes e inyectores

Pendientes previstos:

- ampliar búsqueda de clientes por nombre, identificación y teléfono;
- búsqueda de inyectores por número y cliente;
- filtro de inyectores por cliente;
- filtros por estado activo cuando corresponda;
- validación estricta de identificadores.

## Servicios de inyectores

Pendientes previstos:

- filtro por inyector;
- filtro por cliente;
- filtro por estado;
- filtros por fechas de recepción y entrega;
- búsqueda por número de inyector;
- ordenamiento útil para la bandeja operativa.

## Conteos y costos

Pendientes previstos:

- búsqueda y filtros de conteos por referencia, estado y fecha;
- filtro de líneas por conteo;
- filtros de costos por compra, categoría y producto;
- validación uniforme de identificadores;
- revisión de ordenamiento.

## Búsqueda universal

Pendiente ampliar la búsqueda para incluir, según validación operativa:

- nombre y descripción de producto;
- referencias y fabricantes;
- referencias de proveedor;
- identificación y teléfono del cliente;
- ventas;
- servicios de inyector.

## Regla de implementación

Cada grupo de filtros se implementará junto con su pantalla correspondiente.

Cada cambio deberá incluir:

1. validación de parámetros;
2. pruebas automatizadas;
3. compatibilidad con paginación;
4. documentación;
5. validación desde la interfaz;
6. commit independiente.
