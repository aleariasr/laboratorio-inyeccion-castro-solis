# Sistema de diseño del frontend

## Proyecto

Laboratorio de Inyección Castro Solís — LICS

## Estado

Definición inicial.

## Objetivo

Definir una base visual y de interacción uniforme para todo el frontend de LICS.

Este documento establece:

- principios visuales;
- colores;
- tipografía;
- espaciado;
- tamaños;
- componentes;
- estados;
- tablas;
- formularios;
- navegación;
- accesibilidad;
- interacción con teclado;
- comportamiento en equipos de recursos limitados.

El sistema de diseño debe evitar que cada módulo invente su propia apariencia o comportamiento.

---

# Principios visuales

La interfaz debe ser:

- sobria;
- moderna;
- empresarial;
- limpia;
- clara;
- compacta sin ser incómoda;
- accesible;
- estable;
- consistente;
- rápida de interpretar.

No debe parecer:

- una plantilla genérica;
- una aplicación experimental;
- un panel excesivamente decorativo;
- una interfaz infantil;
- una réplica visual de MS-DOS;
- una página pública de mercadeo.

La prioridad es que el usuario pueda comprender rápidamente:

- dónde está;
- qué información está viendo;
- qué puede hacer;
- qué acción es peligrosa;
- qué estado tiene un registro;
- qué ocurrió después de una operación.

---

# Filosofía de interacción

La interfaz debe funcionar para dos tipos de usuario.

## Usuario nuevo

Necesita:

- etiquetas claras;
- textos comprensibles;
- acciones visibles;
- ayuda contextual;
- confirmaciones;
- mensajes de error útiles;
- rutas de navegación predecibles.

## Usuario experimentado

Necesita:

- pocos pasos;
- navegación con teclado;
- atajos;
- foco automático;
- búsqueda rápida;
- tablas compactas;
- operaciones repetitivas eficientes;
- retorno del foco después de guardar.

La misma interfaz debe servir para ambos perfiles.

No se crearán modos separados de uso.

---

# Uso offline

El frontend no debe depender de:

- Google Fonts;
- CDN;
- iconos cargados desde internet;
- imágenes externas;
- scripts externos;
- servicios de analítica externos;
- recursos remotos.

Todos los recursos necesarios deben estar incluidos en el paquete productivo.

---

# Tipografía

## Fuente principal

Se utilizará una pila de fuentes del sistema:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

No se descargará `Inter` desde internet.

Si no existe localmente, el sistema usará una fuente del sistema.

## Fuente monoespaciada

Para:

- códigos;
- ubicaciones;
- números de factura;
- referencias;
- valores técnicos;
- atajos.

Pila recomendada:

```css
font-family:
  "SFMono-Regular",
  Consolas,
  "Liberation Mono",
  monospace;
```

## Escala tipográfica preliminar

```text
12 px  texto auxiliar
13 px  tablas compactas
14 px  texto principal
16 px  encabezados de sección
20 px  título de página
24 px  título destacado
```

No se utilizarán tamaños menores a 12 px para información relevante.

## Pesos

```text
400  texto normal
500  controles y etiquetas
600  títulos y acciones principales
700  uso excepcional
```

---

# Paleta

La paleta debe ser neutral y sobria.

## Colores base

```text
Fondo principal:       gris muy claro
Superficie:            blanco
Superficie secundaria: gris claro
Texto principal:       gris casi negro
Texto secundario:      gris medio
Borde:                 gris suave
```

## Color de marca

Se utilizará un azul oscuro o azul petróleo como color principal.

Debe comunicar:

- confianza;
- estabilidad;
- precisión;
- entorno empresarial.

No debe ser demasiado saturado.

## Estados

### Éxito

Uso:

- operaciones completadas;
- sistema saludable;
- documentos confirmados;
- servicios entregados.

Debe incluir:

- color;
- texto;
- icono cuando corresponda.

### Advertencia

Uso:

- stock bajo;
- borradores antiguos;
- procesos pendientes;
- datos incompletos.

### Error

Uso:

- fallos;
- acciones rechazadas;
- stock insuficiente;
- errores de validación;
- operaciones peligrosas.

### Información

Uso:

- ayuda;
- datos contextuales;
- instrucciones;
- mensajes neutrales.

## Regla obligatoria

Nunca representar un estado únicamente con color.

Ejemplo incorrecto:

```text
círculo rojo sin texto
```

Ejemplo correcto:

```text
Anulada · icono · color rojo
```

---

# Variables de diseño

El frontend deberá definir tokens CSS para evitar valores dispersos.

Ejemplo preliminar:

```css
:root {
  --color-background: #f5f7f8;
  --color-surface: #ffffff;
  --color-surface-muted: #eef1f3;

  --color-text: #172026;
  --color-text-muted: #5f6b73;
  --color-border: #d9e0e4;

  --color-primary: #174f63;
  --color-primary-hover: #123f4f;
  --color-primary-text: #ffffff;

  --color-success: #1f6b45;
  --color-warning: #8a5a00;
  --color-danger: #a12b2b;
  --color-info: #245b8a;

  --radius-sm: 4px;
  --radius-md: 7px;
  --radius-lg: 10px;

  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.08);
  --shadow-md: 0 4px 12px rgb(0 0 0 / 0.10);
}
```

Los valores podrán ajustarse visualmente durante la implementación.

No deberán cambiarse arbitrariamente por módulo.

---

# Espaciado

Se utilizará una escala consistente basada principalmente en múltiplos de cuatro.

```text
4 px
8 px
12 px
16 px
20 px
24 px
32 px
40 px
48 px
```

## Reglas

- controles relacionados: 8 px;
- grupos de formulario: 16 px;
- secciones: 24 px;
- bloques principales: 32 px;
- márgenes grandes solo cuando sean necesarios.

No se utilizarán espacios excesivos que reduzcan la cantidad de información visible.

---

# Bordes y radios

La interfaz debe sentirse moderna sin parecer redondeada en exceso.

## Radios

```text
4 px   controles pequeños
7 px   botones y campos
10 px  tarjetas y diálogos
```

No utilizar:

- botones completamente redondos como patrón principal;
- tarjetas con radios exagerados;
- bordes decorativos innecesarios.

---

# Sombras

Las sombras deben ser discretas.

Uso permitido:

- diálogos;
- menús flotantes;
- barra superior cuando se separa del contenido;
- tarjetas destacadas.

No usar sombras intensas en todas las superficies.

La separación principal debe conseguirse mediante:

- fondo;
- borde;
- espaciado;
- jerarquía.

---

# Iconografía

Los iconos deben:

- estar disponibles offline;
- compartir estilo visual;
- ser simples;
- acompañar texto en acciones importantes;
- tener etiqueta accesible cuando no haya texto.

No se utilizarán emojis como iconos operativos.

No se seleccionará todavía una biblioteca hasta evaluar:

- tamaño del paquete;
- funcionamiento offline;
- mantenimiento;
- tree shaking;
- accesibilidad.

---

# Estructura principal

## AppShell

Debe contener:

- barra lateral;
- barra superior;
- área principal;
- usuario;
- versión;
- acceso a búsqueda;
- estado básico de conexión.

## Barra lateral

Debe:

- mostrar los módulos autorizados;
- indicar la ruta actual;
- permitir navegación con teclado;
- mantener nombres claros;
- permitir colapsarse cuando sea necesario;
- funcionar en resoluciones modestas.

## Barra superior

Debe mostrar:

- nombre de la sección;
- búsqueda global;
- usuario actual;
- cierre de sesión;
- estado de conexión cuando corresponda.

No debe saturarse con acciones secundarias.

---

# Encabezados de página

Cada pantalla principal debe utilizar un componente uniforme.

Contenido:

- título;
- descripción breve opcional;
- acción principal;
- acciones secundarias;
- breadcrumb únicamente cuando aporte valor.

Ejemplo:

```text
Productos
Administre piezas, ubicaciones y existencias.

[Nuevo producto]
```

La acción principal debe aparecer en una posición estable.

---

# Botones

## Variantes

### Primario

Para la acción principal:

- guardar;
- crear;
- continuar;
- confirmar una acción normal.

Solo debe existir un botón primario dominante por zona.

### Secundario

Para:

- cancelar;
- volver;
- abrir opciones;
- acciones alternativas.

### Peligro

Para:

- anular;
- eliminar;
- desactivar cuando sea sensible;
- acciones irreversibles.

### Fantasma

Para acciones de bajo énfasis:

- cerrar;
- ver detalles;
- acciones dentro de tablas.

## Estados

Todo botón debe soportar:

- normal;
- hover;
- foco;
- activo;
- deshabilitado;
- cargando.

## Reglas

- el texto debe describir la acción;
- evitar botones que digan únicamente “Sí”;
- no cambiar el ancho durante carga;
- mostrar indicador de progreso;
- evitar doble envío;
- no depender únicamente del icono en acciones críticas.

Ejemplo correcto:

```text
Confirmar compra
```

Ejemplo incorrecto:

```text
Aceptar
```

---

# Campos

## Componentes

- texto;
- contraseña;
- número;
- moneda;
- cantidad;
- fecha;
- búsqueda;
- área de texto;
- selector;
- checkbox.

## Estructura

Cada campo debe poder mostrar:

- etiqueta;
- control;
- ayuda;
- error;
- indicador de obligatorio.

## Reglas

- etiqueta siempre visible;
- placeholder no sustituye la etiqueta;
- error cerca del campo;
- valor no debe desaparecer después de un error;
- foco visible;
- tamaño mínimo cómodo;
- entrada numérica alineada según contexto;
- códigos pueden mostrarse con fuente monoespaciada.

## Campos obligatorios

El indicador debe ser consistente.

Ejemplo:

```text
Número de factura *
```

Además, debe existir una explicación general de qué significa el asterisco.

---

# Formularios

## Distribución

Los formularios deben organizarse por grupos lógicos.

Ejemplo de compra:

```text
Datos generales
Proveedor
Factura
Fecha
Moneda

Líneas de compra
Productos
Cantidades
Costos

Notas
```

## Reglas

- no crear formularios excesivamente anchos;
- usar una columna cuando mejore lectura;
- usar dos columnas solo para campos relacionados;
- no colocar más campos en una fila únicamente para ahorrar espacio;
- mantener orden de tabulación lógico;
- colocar acciones al final y, cuando sea útil, en una barra fija.

## Guardado

Debe distinguirse entre:

- guardar borrador;
- confirmar documento;
- anular;
- eliminar.

Estas acciones nunca deben parecer equivalentes.

---

# Validación y errores

## Tipos

### Error de campo

Ejemplo:

```text
El número de factura es obligatorio.
```

### Error general del formulario

Ejemplo:

```text
No fue posible guardar la compra. Revise los campos indicados.
```

### Error de negocio

Ejemplo:

```text
No se puede confirmar la venta porque el producto P-001 no tiene stock suficiente.
```

### Error de red

Ejemplo:

```text
No fue posible comunicarse con el sistema local.
```

## Reglas

- conservar datos ingresados;
- enfocar el primer campo con error;
- no mostrar errores técnicos internos;
- permitir reintentar;
- no reemplazar toda la pantalla cuando el error es local;
- asociar mensajes mediante atributos accesibles.

---

# Tablas

Las tablas serán un componente central del sistema.

## Requisitos

- encabezados claros;
- alineación consistente;
- filas legibles;
- navegación con teclado cuando aporte valor;
- estados vacíos;
- carga;
- error;
- paginación;
- acciones contextualizadas;
- soporte para muchas filas;
- buen rendimiento.

## Densidad

Se utilizará una densidad compacta empresarial.

Altura preliminar de fila:

```text
40–44 px
```

No se usarán filas excesivamente altas.

## Alineación

```text
Texto: izquierda
Códigos: izquierda
Fechas: izquierda o centro
Cantidades: derecha
Dinero: derecha
Estados: izquierda
Acciones: derecha
```

## Acciones por fila

Preferencia:

- acción principal visible;
- acciones secundarias en menú;
- no llenar la tabla de botones.

## Filas seleccionables

Cuando una fila sea navegable:

- debe ser operable con teclado;
- debe mostrar foco;
- no debe impedir seleccionar texto;
- los controles internos deben seguir funcionando.

---

# Paginación

Debe mostrar:

- cantidad total;
- página actual;
- páginas disponibles cuando sea útil;
- anterior;
- siguiente;
- estado deshabilitado.

La paginación deberá conservar:

- filtros;
- búsqueda;
- ordenamiento.

No deberá regresar automáticamente a una consulta sin filtros.

---

# Búsqueda

## Buscador de listado

Debe:

- tener etiqueta accesible;
- permitir limpiar;
- conservar el término;
- mostrar que está buscando;
- evitar solicitudes por cada tecla sin control;
- soportar `Escape` para limpiar cuando sea apropiado.

## Búsqueda global

Debe:

- abrir con `/` o `Ctrl+K`;
- permitir flechas;
- permitir `Enter`;
- cerrar con `Escape`;
- agrupar resultados;
- mostrar categoría;
- mostrar coincidencia principal;
- mostrar información secundaria;
- no interferir con campos de texto.

---

# Estados de datos

Toda pantalla que consulte datos debe definir:

## Carga

- indicador visible;
- estructura estable;
- evitar saltos excesivos.

## Vacío

Debe explicar:

- que no existen datos;
- si se debe crear un registro;
- si hay filtros activos.

Ejemplo:

```text
No hay productos que coincidan con los filtros.
```

## Error

Debe mostrar:

- mensaje comprensible;
- opción de reintentar;
- detalles seguros cuando sean útiles.

## Éxito

Debe mostrar el contenido sin depender de una notificación adicional.

---

# Alertas y notificaciones

## Alertas

Se usan dentro del contenido para mensajes persistentes.

Tipos:

- información;
- éxito;
- advertencia;
- error.

## Notificaciones temporales

Se podrán usar para:

- guardado exitoso;
- acción completada;
- operación breve.

No deberán ser el único medio para comunicar información crítica.

Ejemplo incorrecto:

```text
La venta falló y el mensaje desaparece en dos segundos.
```

Ejemplo correcto:

```text
Error persistente en el formulario y notificación complementaria.
```

---

# Badges de estado

Deben tener:

- texto;
- color;
- contraste;
- forma uniforme.

Estados comunes:

```text
Borrador
Confirmada
Anulada
Aprobado
Recibido
En proceso
Listo
Entregado
Activo
Inactivo
```

Los textos visibles estarán en español aunque la API use códigos internos en inglés.

La traducción debe centralizarse.

---

# Diálogos

## Uso permitido

- confirmación;
- anulación;
- eliminación;
- selección breve;
- información contextual.

## No usar diálogos para

- formularios largos;
- flujos de muchos pasos;
- páginas completas;
- tablas complejas.

## Requisitos

- foco inicial controlado;
- foco atrapado dentro del diálogo;
- cierre con `Escape` cuando sea seguro;
- retorno del foco al elemento que lo abrió;
- título;
- descripción;
- acciones claras.

## Acciones peligrosas

El foco inicial no debe colocarse automáticamente en el botón peligroso.

---

# Confirmaciones críticas

Se requieren para:

- confirmar compra;
- anular compra;
- confirmar venta;
- anular venta;
- aprobar conteo;
- eliminar borradores;
- desactivar registros importantes.

El mensaje debe explicar el efecto.

Ejemplo:

```text
Confirmar esta compra generará entradas de inventario y bloqueará la edición del documento.
```

No usar mensajes genéricos como:

```text
¿Está seguro?
```

---

# Teclado

## Reglas generales

La aplicación debe ser completamente operable con teclado.

Debe respetar:

- `Tab`;
- `Shift+Tab`;
- `Enter`;
- `Escape`;
- flechas;
- barra espaciadora;
- atajos definidos.

## Atajos globales preliminares

```text
/              Abrir búsqueda global
Ctrl+K         Abrir búsqueda global
Alt+N          Nuevo registro
Ctrl+S         Guardar borrador
Escape         Cerrar o cancelar
```

Los atajos deben:

- estar documentados;
- mostrarse cuando sean relevantes;
- no interferir con el navegador;
- no ejecutarse mientras el usuario escribe cuando corresponda;
- funcionar igual en todos los módulos.

## Atajos locales

Podrán existir en:

- compras;
- ventas;
- conteos;
- recepción de inyectores.

Deben implementarse solo cuando el flujo real esté confirmado.

---

# Foco

## Requisitos

- foco visible;
- orden lógico;
- foco inicial predecible;
- retorno de foco;
- enfoque del primer error;
- no mover el foco inesperadamente.

## Ejemplos

Login:

```text
foco inicial en usuario
```

Nueva venta:

```text
foco inicial en búsqueda de producto
```

Después de agregar una línea:

```text
retorno a búsqueda de producto
```

Después de un error:

```text
foco en el primer campo inválido
```

---

# Lectores de código de barras

Se asumirán lectores que funcionan como teclado.

El frontend debe:

- aceptar entrada rápida;
- procesar `Enter`;
- evitar retrasos innecesarios;
- devolver foco al campo;
- mostrar resultado;
- manejar código no encontrado;
- evitar duplicados accidentales.

No se implementará integración especializada con hardware sin requerimiento real.

---

# Accesibilidad

## Requisitos mínimos

- idioma `es`;
- HTML semántico;
- encabezados jerárquicos;
- etiquetas de formulario;
- foco visible;
- contraste suficiente;
- navegación con teclado;
- mensajes de error asociados;
- estados no dependientes del color;
- botones con nombre accesible;
- diálogos accesibles;
- tablas con encabezados;
- reducción de movimiento;
- textos legibles.

## Movimiento

Las animaciones deben ser:

- breves;
- discretas;
- funcionales.

Se debe respetar:

```css
@media (prefers-reduced-motion: reduce)
```

No usar animaciones decorativas continuas.

---

# Responsividad

El sistema está orientado principalmente a escritorio en modo kiosco.

Debe funcionar correctamente en:

- 1366 × 768;
- 1280 × 720;
- resoluciones superiores.

También debe tolerar ventanas menores para soporte técnico.

La prioridad no es una experiencia móvil completa.

No obstante:

- no debe romperse;
- no debe ocultar acciones críticas;
- tablas deben manejar desbordamiento;
- navegación debe adaptarse razonablemente.

---

# Rendimiento

## Reglas

- evitar bibliotecas pesadas sin necesidad;
- evitar renderizados innecesarios;
- paginar listados;
- no cargar relaciones completas si no se necesitan;
- no usar imágenes grandes;
- no usar animaciones costosas;
- no depender de efectos visuales complejos;
- reutilizar componentes;
- medir antes de optimizar prematuramente.

## Computadora objetivo

Se debe considerar:

- procesador antiguo;
- memoria limitada;
- almacenamiento posiblemente lento;
- navegador Chromium en modo kiosco.

---

# Formato de datos

## Fechas

Formato visible esperado:

```text
14/07/2026
```

Cuando incluya hora:

```text
14/07/2026 15:30
```

Los valores enviados a la API seguirán usando formatos compatibles con ISO.

## Moneda

Debe mostrar:

- símbolo o código;
- separadores consistentes;
- cantidad fija de decimales según el contexto.

Ejemplos:

```text
₡12 500,00
USD 42,50
```

Los cálculos deben venir del backend cuando correspondan.

## Cantidades

Deben alinearse a la derecha.

## Códigos

Deben conservar mayúsculas cuando el dominio así lo requiera.

---

# Lenguaje

La interfaz estará en español de Costa Rica.

Los mensajes deben ser:

- claros;
- directos;
- respetuosos;
- orientados a la acción.

Evitar lenguaje técnico innecesario.

Ejemplo:

```text
No fue posible guardar el producto.
```

En lugar de:

```text
Error 500 en endpoint de productos.
```

---

# Nombres de acciones

Usar verbos específicos:

```text
Guardar borrador
Confirmar compra
Anular venta
Aprobar conteo
Marcar como listo
Entregar inyector
Generar etiquetas
```

Evitar:

```text
Aceptar
Procesar
Ejecutar
Continuar
```

cuando no indiquen claramente el resultado.

---

# Componentes iniciales aprobados

La primera implementación del sistema de diseño incluirá únicamente componentes necesarios para autenticación y estructura base:

- `Button`;
- `Input`;
- `Field`;
- `FormError`;
- `Alert`;
- `LoadingState`;
- `AppLogo`;
- `KeyboardShortcut`.

Después se agregarán componentes según uso real.

No se crearán todos los componentes por adelantado.

---

# Política de dependencias

Antes de instalar una dependencia se debe revisar:

- mantenimiento;
- licencia;
- tamaño;
- compatibilidad;
- funcionamiento offline;
- accesibilidad;
- necesidad real;
- posibilidad de resolverlo con HTML y CSS.

Toda dependencia nueva debe:

- agregarse mediante commit específico o claramente relacionado;
- quedar en `package-lock.json`;
- probarse en Docker;
- compilar en producción.

---

# Criterios de aceptación del sistema de diseño

El sistema de diseño inicial se considera listo cuando:

- existe una paleta centralizada;
- existe una escala tipográfica;
- existe una escala de espaciado;
- los controles tienen foco visible;
- los estados no dependen del color;
- los primeros componentes son reutilizables;
- login y estructura base usan los mismos componentes;
- funciona sin internet;
- funciona con teclado;
- `npm run lint` pasa;
- `npm run build` pasa;
- la documentación coincide con la implementación.

---

# Regla de evolución

Este documento no es inmutable.

Puede evolucionar cuando:

- pruebas con usuarios revelen problemas;
- una necesidad operativa lo justifique;
- un componente no funcione correctamente;
- accesibilidad requiera cambios;
- rendimiento requiera ajustes.

Todo cambio importante debe:

1. justificarse;
2. aplicarse de forma uniforme;
3. probarse;
4. documentarse;
5. versionarse.
