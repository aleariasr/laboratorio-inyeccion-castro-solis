# Roadmap de frontend

## Proyecto

Laboratorio de Inyección Castro Solís — LICS

## Estado

Planificación inicial.

## Objetivo

Construir un frontend empresarial estable, uniforme, intuitivo, accesible y eficiente para operar el sistema LICS en producción real.

El frontend debe permitir que una persona nueva comprenda rápidamente el sistema y que un usuario experimentado trabaje con alta velocidad mediante teclado, búsqueda, foco predecible y pocos pasos.

Este roadmap no define únicamente pantallas. También define:

- orden de implementación;
- dependencias técnicas;
- criterios de calidad;
- pruebas obligatorias;
- requisitos de accesibilidad;
- reglas de componentes compartidos;
- pendientes backend necesarios;
- documentación;
- control de versiones.

---

# Principios generales

## Producción desde el inicio

Toda decisión debe considerar:

- operación offline;
- computadora de recursos limitados;
- reinicios inesperados;
- pérdida temporal del backend;
- errores de validación;
- datos incompletos;
- permisos insuficientes;
- grandes cantidades de registros;
- soporte técnico remoto;
- actualizaciones controladas;
- mantenimiento a largo plazo.

## Uniformidad

Todo el sistema debe compartir:

- tipografía;
- paleta;
- espaciado;
- botones;
- tablas;
- formularios;
- encabezados;
- diálogos;
- mensajes;
- estados;
- navegación;
- atajos;
- patrones de carga y error.

Ningún módulo debe crear su propia apariencia o comportamiento sin una justificación documentada.

## Velocidad operativa

La interfaz debe permitir trabajar rápidamente con:

- teclado;
- lector de código de barras;
- búsqueda global;
- foco automático;
- atajos visibles;
- navegación mediante flechas;
- formularios con orden lógico;
- acciones principales predecibles;
- conservación de datos cuando ocurre un error.

## Backend como autoridad

El frontend:

- no calcula stock como fuente de verdad;
- no cambia estados críticos mediante edición directa;
- no decide permisos definitivos;
- no reproduce reglas complejas de negocio;
- no genera identificadores operativos por su cuenta;
- no modifica registros históricos inmutables.

El backend seguirá validando todas las operaciones.

---

# Metodología por bloque

Cada bloque seguirá este ciclo:

1. Revisar requerimientos.
2. Revisar endpoints, serializers, servicios y permisos.
3. Identificar dependencias backend.
4. Definir flujo de usuario.
5. Definir estados de interfaz.
6. Implementar componentes necesarios.
7. Implementar la pantalla.
8. Ejecutar lint.
9. Ejecutar compilación TypeScript.
10. Ejecutar build productivo.
11. Ejecutar pruebas automatizadas.
12. Validar manualmente.
13. Validar con teclado.
14. Validar permisos.
15. Validar carga, error y estado vacío.
16. Documentar.
17. Revisar `git diff`.
18. Crear un commit pequeño.
19. Enviar a GitHub.

No se iniciará un bloque nuevo si el anterior no cumple sus criterios de aceptación.

---

# Fase F0: auditoría y planificación

## Estado

En progreso.

## Alcance

- inventario de endpoints;
- revisión de entidades;
- revisión de estados;
- revisión de permisos;
- revisión de reportes;
- revisión de documentos;
- revisión de infraestructura;
- identificación de pendientes backend;
- definición de navegación;
- definición inicial de accesibilidad;
- definición inicial de teclado.

## Entregables

- `docs/frontend-audit.md`;
- `docs/frontend-roadmap.md`;
- `docs/frontend-design-system.md`;
- actualización de documentación backend desactualizada.

## Criterio de cierre

- alcance funcional documentado;
- módulos identificados;
- riesgos identificados;
- orden de implementación aprobado;
- pendientes backend clasificados.

---

# Fase F1: preparación backend para listados

## Objetivo

Preparar respuestas adecuadas para una interfaz productiva sin cargar cantidades ilimitadas de datos.

## Alcance

- paginación global de Django REST Framework;
- tamaño de página razonable;
- pruebas para respuestas paginadas;
- revisión de endpoints que requieren listas completas;
- búsqueda y filtros básicos por módulo;
- ordenamiento estable;
- revisión de permisos cruzados.

## Decisiones esperadas

La respuesta estándar de un listado deberá contener:

- `count`;
- `next`;
- `previous`;
- `results`.

El tamaño inicial de página deberá priorizar:

- rendimiento;
- legibilidad;
- rapidez en equipos antiguos;
- reducción de solicitudes innecesarias.

## Riesgos

Agregar paginación cambia el formato actual de las respuestas y puede afectar pruebas y futuros consumidores.

## Criterio de cierre

- pruebas backend completas;
- documentación actualizada;
- endpoints principales paginados;
- comportamiento de filtros confirmado;
- sin migraciones innecesarias.

---

# Fase F2: base técnica del frontend

## Objetivo

Crear la infraestructura interna sobre la cual se construirán todas las pantallas.

## Estructura preliminar

```text
frontend/src/
├── app/
├── components/
│   ├── ui/
│   ├── forms/
│   ├── feedback/
│   ├── navigation/
│   └── data-display/
├── features/
├── lib/
│   ├── api/
│   ├── auth/
│   ├── keyboard/
│   ├── permissions/
│   └── utils/
├── hooks/
├── types/
└── test/
```

La estructura final debe mantenerse simple. No se crearán carpetas vacías ni abstracciones sin uso real.

## Alcance

- configuración de idioma español;
- metadatos de LICS;
- estilos globales;
- tokens de diseño;
- cliente API;
- tipos base;
- normalización de errores;
- manejo de respuestas paginadas;
- manejo de token;
- utilidades de permisos;
- configuración de pruebas;
- páginas de error;
- página no encontrada.

## Cliente API

Debe centralizar:

- URL base;
- cabecera `Authorization`;
- serialización JSON;
- respuestas sin contenido;
- errores de red;
- errores `400`;
- errores `401`;
- errores `403`;
- errores `404`;
- errores `500`;
- tiempo de espera;
- cancelación de solicitudes cuando sea necesaria.

No se permitirán llamadas `fetch` dispersas con comportamientos distintos en cada pantalla.

## Criterio de cierre

- lint limpio;
- build limpio;
- estructura documentada;
- cliente API probado;
- errores normalizados;
- sin dependencia de internet.

---

# Fase F3: sistema de diseño

## Objetivo

Definir una biblioteca interna de componentes uniformes antes de construir módulos.

## Componentes base

- botón primario;
- botón secundario;
- botón de peligro;
- botón de icono;
- enlace con apariencia de acción;
- campo de texto;
- campo numérico;
- campo de fecha;
- área de texto;
- selector;
- casilla;
- etiqueta de campo;
- ayuda de campo;
- error de campo;
- badge de estado;
- alerta;
- tarjeta;
- sección;
- encabezado de página;
- barra de herramientas;
- tabla;
- paginación;
- buscador;
- indicador de carga;
- estado vacío;
- estado de error;
- diálogo;
- confirmación;
- menú contextual;
- indicador de atajo.

## Reglas

- cada componente debe tener estados de foco;
- cada componente debe soportar deshabilitado;
- cada componente debe soportar error cuando corresponda;
- no depender únicamente del color;
- no utilizar tamaños demasiado pequeños;
- evitar animaciones costosas;
- respetar reducción de movimiento;
- usar semántica HTML correcta.

## Criterio de cierre

- componentes documentados;
- ejemplos internos;
- navegación completa con teclado;
- contraste revisado;
- estados uniformes;
- lint y build limpios.

---

# Fase F4: autenticación y sesión

## Objetivo

Permitir acceso seguro y controlado al sistema.

## Pantallas

- login;
- sesión expirada;
- acceso denegado.

## Funcionalidades

- iniciar sesión;
- guardar token de forma controlada;
- consultar usuario actual;
- cerrar sesión;
- limpiar sesión inválida;
- redirigir según autenticación;
- mostrar errores de credenciales;
- impedir acceso a rutas protegidas.

## Experiencia de teclado

- foco inicial en usuario;
- `Enter` avanza o envía;
- mensajes claros;
- retorno del foco al campo con error;
- botón visible para mostrar u ocultar contraseña.

## Pendientes por definir

Debe decidirse explícitamente dónde almacenar el token considerando que:

- el sistema opera en una computadora dedicada;
- el navegador funciona en modo kiosco;
- el backend usa Token Authentication;
- el riesgo principal es acceso físico al equipo.

La decisión debe documentarse y evitar soluciones aparentes de seguridad que no protejan realmente frente al acceso físico.

## Criterio de cierre

- login funcional;
- logout funcional;
- sesión restaurada;
- ruta protegida;
- manejo de `401`;
- pruebas;
- validación manual;
- build productivo.

---

# Fase F5: estructura principal de la aplicación

## Objetivo

Crear la navegación común de todos los módulos.

## Componentes

- `AppShell`;
- barra lateral;
- barra superior;
- identidad de la empresa;
- usuario actual;
- navegación por permisos;
- acceso a búsqueda;
- cierre de sesión;
- indicador de conexión;
- versión del sistema.

## Navegación prevista

### Inicio

- resumen;
- alertas;
- accesos frecuentes.

### Inventario

- productos;
- ubicaciones;
- conteos;
- existencias;
- movimientos.

### Compras

- compras;
- proveedores;
- referencias;
- costos;
- historial.

### Ventas

- nueva venta;
- historial.

### Clientes y servicio

- clientes;
- inyectores;
- servicios;
- accesorios.

### Reportes

- reportes disponibles.

### Documentos

- etiquetas;
- documentos futuros.

### Administración

- usuarios;
- configuración;
- estado.

## Criterio de cierre

- menú uniforme;
- responsive razonable;
- uso correcto en modo kiosco;
- navegación con teclado;
- permisos visuales;
- ruta activa visible;
- sin desbordamientos en resoluciones modestas.

---

# Fase F6: estado del sistema e inicio

## Objetivo

Crear la primera pantalla operativa y administrativa.

## Inicio

Debe mostrar información útil, no métricas decorativas.

Candidatos iniciales:

- productos bajo mínimo;
- servicios listos;
- servicios en proceso;
- compras recientes;
- ventas recientes;
- accesos rápidos;
- estado general.

Solo se mostrarán datos que tengan respaldo en endpoints existentes o requerimientos confirmados.

## Estado del sistema

Debe consumir:

- `/api/system/status/`;
- `/api/health/` cuando corresponda.

Debe mostrar:

- estado;
- versión;
- entorno;
- hora del servidor;
- usuario;
- roles;
- módulos disponibles.

## Criterio de cierre

- datos reales;
- estados de carga;
- error y reintento;
- accesibilidad;
- visualización clara;
- sin inventar indicadores.

---

# Fase F7: búsqueda universal

## Objetivo

Convertir la búsqueda en el principal mecanismo de acceso rápido.

## Interacción

- abrir con `/`;
- abrir con `Ctrl+K`;
- búsqueda con retardo corto;
- mínimo de caracteres visible;
- agrupación por categoría;
- selección mediante flechas;
- apertura con `Enter`;
- cierre con `Escape`;
- resaltado de coincidencias;
- mensajes sin resultados.

## Pendientes backend

Antes de considerarla definitiva se debe revisar búsqueda por:

- código;
- nombre;
- descripción;
- ubicación;
- referencia;
- fabricante;
- proveedor;
- factura;
- cliente;
- identificación;
- teléfono;
- inyector;
- servicio.

## Criterio de cierre

- navegación completa con teclado;
- respuestas rápidas;
- resultados agrupados;
- enlaces correctos;
- ausencia de resultados controlada;
- pruebas de accesibilidad.

---

# Fase F8: productos y ubicaciones

## Objetivo

Construir la base operativa del inventario.

## Productos

Pantallas:

- listado;
- detalle;
- creación;
- edición;
- referencias;
- generación de etiquetas.

Columnas preliminares:

- código;
- producto;
- ubicación;
- stock;
- mínimo;
- unidad;
- estado.

Acciones:

- crear;
- editar;
- activar o desactivar;
- consultar movimientos;
- generar etiqueta;
- acceder a referencias.

## Ubicaciones

Pantallas:

- listado;
- creación;
- edición;
- productos asociados.

## Reglas

- no editar stock;
- mostrar stock como dato calculado;
- destacar productos bajo mínimo;
- no usar rojo como único indicador;
- facilitar búsqueda por código o ubicación.

## Criterio de cierre

- paginación;
- filtros;
- búsqueda;
- formularios;
- errores;
- permisos;
- etiquetas PDF;
- navegación con teclado;
- pruebas.

---

# Fase F9: proveedores y referencias

## Objetivo

Administrar proveedores y códigos comerciales.

## Pantallas

- listado de proveedores;
- detalle;
- creación;
- edición;
- productos suministrados;
- referencias proveedor-producto.

## Interacción

Desde un proveedor debe ser posible:

- consultar productos relacionados;
- agregar una referencia;
- marcar preferencia cuando corresponda;
- localizar compras.

Desde un producto debe ser posible:

- consultar referencias;
- consultar proveedores;
- identificar códigos alternativos.

## Criterio de cierre

- relaciones comprensibles;
- prevención de duplicados;
- búsqueda;
- permisos;
- formularios uniformes;
- pruebas.

---

# Fase F10: compras

## Objetivo

Implementar el flujo completo de compra como documento.

## Pantallas

- listado de compras;
- nueva compra;
- detalle;
- edición de borrador;
- costos;
- resumen;
- anulación.

## Flujo

1. Crear encabezado.
2. Agregar líneas.
3. Revisar subtotales.
4. Agregar costos adicionales.
5. Consultar resumen.
6. Confirmar.
7. Mostrar auditoría.
8. Anular con motivo cuando corresponda.

## Productividad

- búsqueda rápida de referencia;
- agregar línea con teclado;
- foco en cantidad;
- foco en costo;
- `Enter` para avanzar;
- conservación del borrador;
- evitar líneas duplicadas;
- totales visibles.

## Seguridad

- confirmar mediante diálogo;
- explicar que afectará inventario;
- anular mediante motivo obligatorio;
- documentos finalizados en solo lectura;
- no mostrar eliminar cuando no corresponda.

## Criterio de cierre

- flujo completo;
- stock actualizado;
- errores claros;
- acciones por estado;
- auditoría visible;
- pruebas;
- build.

---

# Fase F11: costos de importación

## Objetivo

Permitir distribuir y consultar costos sin alterar históricos.

## Pantallas

- categorías;
- costos por compra;
- cálculo;
- resumen;
- histórico por producto.

## Reglas

- histórico de solo lectura;
- margen explícito;
- moneda visible;
- tipo de cambio visible;
- factor de costo explicado;
- valores monetarios con formato uniforme;
- evitar redondeos inconsistentes en el frontend.

## Criterio de cierre

- cálculos mostrados desde backend;
- historial protegido;
- errores;
- permisos;
- pruebas.

---

# Fase F12: ventas

## Objetivo

Implementar ventas como documento operativo, sin asumir caja.

## Pantallas

- nueva venta;
- historial;
- detalle;
- edición de borrador;
- confirmación;
- anulación.

## Flujo

1. Crear borrador.
2. Seleccionar cliente opcional.
3. Agregar productos.
4. Mostrar disponibilidad.
5. Indicar precio.
6. Revisar totales.
7. Confirmar.
8. Mostrar auditoría.
9. Anular con motivo.

## Productividad

- búsqueda por código;
- lector de código de barras;
- foco automático;
- incremento rápido de cantidad;
- acceso rápido a nueva línea;
- alerta temprana de stock insuficiente;
- confirmación explícita.

## Límites

No incluir todavía:

- caja;
- métodos de pago;
- cierres;
- vuelto;
- crédito;
- comprobantes fiscales.

## Criterio de cierre

- validación de stock;
- reversión al anular;
- documentos finalizados protegidos;
- pruebas;
- navegación rápida.

---

# Fase F13: clientes

## Objetivo

Administrar clientes de manera sencilla.

## Pantallas

- listado;
- creación;
- edición;
- detalle;
- inyectores;
- ventas relacionadas;
- servicios relacionados.

## Búsqueda

Debe contemplar:

- nombre;
- identificación;
- teléfono.

## Criterio de cierre

- búsqueda rápida;
- prevención de duplicados;
- formularios claros;
- relaciones visibles;
- permisos;
- pruebas.

---

# Fase F14: inyectores y servicios

## Objetivo

Construir una bandeja operativa para el trabajo del laboratorio.

## Pantallas

- inyectores;
- recepción;
- servicios recibidos;
- en proceso;
- listos;
- entregados;
- anulados;
- detalle de servicio;
- accesorios.

## Flujo

1. Buscar o crear cliente.
2. Buscar o registrar inyector.
3. Recibir servicio.
4. Registrar condición inicial.
5. Iniciar.
6. Registrar mediciones y trabajo.
7. Marcar listo.
8. Entregar.
9. Registrar condición final.

## Experiencia

- acciones según estado;
- estado siempre visible;
- línea temporal;
- datos del cliente accesibles;
- impresión futura de boleta;
- filtros por estado;
- búsqueda por inyector.

## Criterio de cierre

- transiciones correctas;
- acciones inválidas ocultas y rechazadas;
- accesorios;
- auditoría;
- teclado;
- pruebas.

---

# Fase F15: conteos físicos

## Objetivo

Facilitar conteos rápidos y auditables.

## Pantallas

- listado;
- nuevo conteo;
- captura;
- revisión;
- aprobación;
- detalle final.

## Productividad

- escaneo;
- búsqueda;
- cantidad;
- avance con `Enter`;
- prevención de duplicados;
- diferencias visibles;
- navegación por teclado;
- aprobación explícita.

## Seguridad

- explicar que aprobar genera movimientos;
- no permitir editar después;
- no permitir eliminar después;
- mostrar usuario y fecha.

## Criterio de cierre

- captura rápida;
- ajustes correctos;
- acciones por estado;
- pruebas;
- validación manual.

---

# Fase F16: movimientos y existencias

## Objetivo

Dar trazabilidad completa sin permitir alteraciones directas.

## Pantallas

- stock por producto;
- stock por ubicación;
- movimientos;
- kardex básico;
- detalle de origen;
- reversión relacionada.

## Filtros

- producto;
- ubicación;
- tipo;
- fecha;
- documento relacionado.

## Reglas

- solo lectura;
- mostrar dirección;
- mostrar cantidad;
- mostrar origen;
- mostrar usuario;
- mostrar fecha;
- vincular reversión con movimiento original.

## Criterio de cierre

- trazabilidad clara;
- paginación;
- filtros;
- buen rendimiento;
- pruebas.

---

# Fase F17: reportes

## Objetivo

Presentar información operativa útil.

## Reportes iniciales

- bajo mínimo;
- stock por ubicación;
- movimientos;
- compras por proveedor;
- ventas por fecha;
- productos más vendidos.

## Reglas

- filtros uniformes;
- fechas claras;
- estado vacío;
- totales correctos;
- impresión solo cuando se valide;
- no mezclar reportes con CRUD.

## Criterio de cierre

- resultados comprensibles;
- filtros;
- rendimiento;
- exportación o PDF únicamente cuando sea necesario;
- pruebas.

---

# Fase F18: documentos

## Objetivo

Centralizar documentos imprimibles.

## Inicial

- etiquetas de producto.

## Posteriores según validación

- catálogo;
- bajo mínimo;
- compra;
- venta;
- recepción;
- entrega;
- movimientos;
- comparación de precios.

## Criterio de cierre

- PDF correcto;
- vista previa o descarga;
- manejo de errores;
- impresión validada;
- no depender de internet.

---

# Fase F19: administración de usuarios

## Objetivo

Administrar usuarios y roles de forma segura.

## Dependencia backend

Debe existir soporte controlado para:

- listar roles;
- asignar roles;
- retirar roles;
- validar permisos administrativos.

## Pantallas

- usuarios;
- nuevo usuario;
- edición;
- activación;
- roles;
- restablecimiento de contraseña futuro.

## Seguridad

- no mostrar contraseñas;
- contraseña mínima;
- confirmación de acciones sensibles;
- impedir que un administrador se bloquee accidentalmente cuando corresponda;
- auditoría futura según necesidad.

## Criterio de cierre

- roles funcionales;
- permisos;
- pruebas backend y frontend;
- documentación.

---

# Fase F20: configuración y diagnóstico

## Objetivo

Facilitar soporte y operación.

## Pantallas

- estado del sistema;
- versión;
- módulos;
- usuario;
- entorno;
- diagnóstico;
- configuración de empresa cuando exista endpoint estable.

## Límites

No exponer:

- secretos;
- contraseñas;
- tokens;
- variables sensibles;
- detalles internos innecesarios.

## Criterio de cierre

- información útil;
- información segura;
- soporte técnico facilitado;
- pruebas.

---

# Fase F21: validación real

## Objetivo

Probar el sistema con trabajadores y procesos reales.

## Validaciones

- tiempo para registrar una compra;
- tiempo para registrar una venta;
- búsqueda de producto;
- lectura de etiquetas;
- conteo físico;
- recepción de inyector;
- entrega de inyector;
- navegación con teclado;
- comprensión de mensajes;
- errores frecuentes;
- campos faltantes;
- pasos innecesarios.

## Entregables

- lista de observaciones;
- ajustes prioritarios;
- requerimientos confirmados;
- módulos descartados;
- nuevos documentos necesarios;
- definición de caja.

---

# Fase F22: endurecimiento y entrega

## Objetivo

Preparar la interfaz para producción.

## Alcance

- pruebas funcionales;
- pruebas de permisos;
- pruebas de accesibilidad;
- pruebas de teclado;
- pruebas de rendimiento;
- pruebas en computadora objetivo;
- pruebas sin internet;
- prueba de reinicio;
- prueba de sesión;
- prueba de error backend;
- manual de usuario;
- manual técnico;
- capacitación.

## Criterio final

El frontend solo se considerará listo cuando:

- sea estable;
- sea comprensible;
- sea rápido;
- sea operable con teclado;
- tenga componentes uniformes;
- maneje errores;
- respete permisos;
- compile para producción;
- funcione offline;
- esté documentado;
- haya sido validado con usuarios reales.

---

# Estrategia de pruebas

## Por componente

- renderizado;
- variantes;
- foco;
- teclado;
- deshabilitado;
- error;
- accesibilidad básica.

## Por pantalla

- carga;
- éxito;
- vacío;
- error;
- permisos;
- validaciones;
- acciones;
- navegación.

## Por flujo

- login;
- compra;
- venta;
- conteo;
- servicio;
- documento.

## Validaciones obligatorias en cada bloque

```bash
docker compose -f infra/docker/compose.yml exec frontend \
  npm run lint
```

```bash
docker compose -f infra/docker/compose.yml exec frontend \
  npm run build
```

Cuando se agregue una herramienta de pruebas, también deberá existir un comando estable documentado.

---

# Estrategia de commits

Los commits deben ser pequeños y específicos.

Ejemplos:

```text
docs: add frontend roadmap
feat(frontend): add API client
feat(frontend): add authentication flow
feat(frontend): add application shell
feat(frontend): add product list
fix(frontend): preserve form values after API errors
test(frontend): add login form tests
```

No mezclar en un mismo commit:

- backend;
- frontend;
- documentación extensa;
- dependencias;
- múltiples módulos;

salvo que formen una unidad técnica inseparable.

---

# Pendientes prioritarios antes del primer módulo

1. Actualizar documentación backend.
2. Definir paginación.
3. Revisar filtros esenciales.
4. Definir almacenamiento de sesión.
5. Definir cliente API.
6. Crear sistema de diseño.
7. Definir estrategia de pruebas.
8. Revisar roles cruzados.
9. Confirmar comportamiento del estado administrativo.
10. Mantener caja fuera del alcance actual.

---

# Primer bloque de implementación aprobado

Una vez cerradas las fases de planificación, el primer bloque será:

1. metadatos y estilos globales;
2. estructura mínima de carpetas;
3. tokens visuales;
4. cliente API;
5. normalización de errores;
6. autenticación;
7. login;
8. sesión;
9. logout;
10. ruta protegida;
11. estado del sistema.

No se iniciarán productos, compras o ventas antes de que esta base funcione correctamente.
