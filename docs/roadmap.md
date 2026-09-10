# Roadmap del proyecto

## Principio general

El proyecto LICS se desarrolla por fases, priorizando estabilidad, mantenibilidad, seguridad, recuperación ante fallos, trazabilidad, operación offline y facilidad de soporte técnico.

No se considera definitivo ningún flujo de negocio hasta validarlo con usuarios reales, datos reales y pantallas operativas.

El backend base ya existe, pero no debe seguir ampliándose por suposición. La siguiente fase recomendada es construir el frontend operativo mínimo para probar los flujos reales del negocio.

---

# Estado actual

Versión actual:

    2.0.0

Estado resumido:

    Infraestructura productiva base: completada.
    Backend base: completado.
    App de escritorio Windows (Electron + WSL2 + Docker Engine): completada, con dos riesgos de
    validación todavía abiertos (ver "Pendiente conocido" en windows-production-checklist.md):
    el endurecimiento de las tareas programadas ocultas (§10.3 de windows-desktop-stage-closure.md)
    y "Actualizar aplicación" nunca probados con uso real extendido / hardware real.
    Frontend operativo: login, sesión, navegación, estado del sistema, búsqueda universal, productos
    (incluye variantes original/genérico bajo un mismo código, §3.6), ubicaciones, proveedores, compras,
    costos de importación, ventas, clientes, inyectores, servicios, cierre de caja semanal, proforma y
    facturas internas en PDF, conteos físicos, movimientos de inventario, administración de usuarios,
    reportes y etiquetas PDF implementados. Ver el "Resumen funcional implementado" del README principal
    para el detalle completo.
    Backlog de la visita al cliente (2026-09, 20 puntos): completado, salvo el punto §5 (sin contenido
    concreto todavía — pendiente de que el cliente identifique qué le molesta específicamente del
    proceso de clientes/servicios).
    Validación con usuarios reales: pendiente.
    Migración DBF legacy: completada (2026-09-09) — proveedores, productos y compras reales del
    cliente importados y conciliados contra el stock auxiliar legacy. Ver "Fase 10" abajo y
    docs/dbf-migration-closure.md.

---

# Backlog de la visita a la empresa (2026-09) — completado

Ver [`backlog-cliente-2026-09.md`](backlog-cliente-2026-09.md) para el detalle completo,
verificado contra el código real, de los 20 puntos recogidos en una visita al cliente:
inductancia/aislamiento en servicios, precio de servicios y "Tipo de Servicio" con histórico,
accesorios de servicio ligados al inventario real, cierre de caja semanal, proforma y facturas
internas, y un rediseño estructural del modelo de "referencia" (productos genéricos vs.
originales), entre otros. Los 19 puntos con contenido concreto están implementados, probados y
con lint/build limpio. El punto #15 (§5) sigue sin contenido concreto — es una sensación general
del cliente sobre el proceso de clientes/servicios, sin problema específico identificado todavía;
no se debe inventar contenido para ese punto, hay que esperar a que el cliente lo precise.

Documentos relacionados:

- [README principal](../README.md)
- [Índice de documentación](index.md)
- [Cierre de backend base](backend-base-closure.md)
- [Cierre de infraestructura productiva base](infrastructure-stage-closure.md)
- [Despliegue en Windows (app de escritorio, plan vigente)](../infra/windows/README.md)
- [Cierre de etapa: app de escritorio para Windows](windows-desktop-stage-closure.md)
- [Lista de preparación para producción](production-readiness-checklist.md)

---

# Fase 0: documentación y decisiones técnicas

Estado: completada.

Incluye:

- arquitectura base;
- plataforma objetivo;
- estrategia offline;
- separación de entornos;
- criterios de seguridad;
- persistencia;
- estrategia de backup;
- estrategia de restauración;
- estrategia de actualización offline;
- criterios mínimos de producción.

Documentos relacionados:

- [Arquitectura](architecture.md)
- [Despliegue](deployment.md)
- [Seguridad](security.md)
- [Backups y restauración](backup-restore.md)
- [Proceso de actualización](update-process.md)

---

# Fase 1: repositorio y estructura profesional

Estado: completada.

Incluye:

- repositorio GitHub;
- control de versiones;
- estructura separada de backend, frontend, infraestructura, scripts y documentación;
- archivo `VERSION`;
- documentación base;
- configuración de Docker;
- reglas de exclusión de secretos;
- separación entre desarrollo y producción.

Pendiente administrativo recomendado:

- proteger `main`;
- trabajar cambios grandes mediante ramas y pull requests;
- mantener commits pequeños y descriptivos.

---

# Fase 2: infraestructura productiva base

Estado: completada.

Incluye:

- Docker Compose;
- PostgreSQL 17;
- Django;
- Gunicorn;
- Next.js;
- Nginx;
- red interna;
- volúmenes persistentes;
- healthchecks;
- imágenes orientadas a `linux/amd64`;
- configuración productiva separada;
- secretos fuera de Git.

Documentos relacionados:

- [Arquitectura](architecture.md)
- [Despliegue](deployment.md)
- [Estructura de producción](production-layout.md)
- [Cierre de infraestructura productiva base](infrastructure-stage-closure.md)

---

# Fase 3: scripts operativos, backup y recuperación

Estado: completada.

Incluye:

- inicio del sistema;
- parada controlada;
- reinicio controlado;
- consulta de estado;
- healthcheck integral;
- backup manual;
- backup automático;
- verificación de backup;
- restauración de prueba;
- restauración productiva;
- backup preventivo antes de restaurar;
- detección de corrupción;
- política de retención local.

Pendiente futuro:

- copia automática a USB o disco externo;
- prueba periódica programada de restauración;
- exportación de diagnóstico para soporte.

Documentos relacionados:

- [Backups y restauración](backup-restore.md)
- [Solución de problemas](troubleshooting.md)

---

# Fase 4: instalación offline, actualización y rollback

Estado: completada como base.

> El mecanismo descrito acá (paquete offline, checksums, `install-preflight.sh`,
> `update.sh`, `rollback.sh`) se reutiliza sin cambios dentro de la distro
> WSL2 de la app de escritorio para Windows — ver
> [Despliegue en Windows](../infra/windows/README.md). La única capa nueva
> es el instalador `.exe` que prepara WSL2 y arranca este mismo flujo.

Incluye:

- paquete offline versionado;
- manifiesto;
- checksums SHA-256;
- carga local de imágenes Docker;
- instalación offline;
- generación automática de secretos;
- ejecución de migraciones;
- creación idempotente de roles base;
- healthcheck posterior;
- actualización offline;
- backup obligatorio antes de actualizar;
- rollback productivo validado.

Pendiente de validación final:

- validar el flujo completo sobre el equipo Windows objetivo (dentro de
  WSL2) — ver checklist vigente en
  [windows-production-checklist.md](windows-production-checklist.md);
- validar recuperación después de reiniciar el equipo;
- validar recuperación después de apagón o corte inesperado.

Documentos relacionados:

- [Despliegue en Windows (app de escritorio)](../infra/windows/README.md)
- [Cierre de etapa: app de escritorio para Windows](windows-desktop-stage-closure.md)
- [Despliegue (histórico, plan Linux/kiosco)](deployment.md)
- [Proceso de actualización](update-process.md)
- [Lista de preparación para producción — Windows](windows-production-checklist.md)

---

# Fase 5: sistema operativo, soporte y modo kiosco

> **Histórico — plan de despliegue superado.** Esta fase asumía Linux
> (Ubuntu Desktop/Linux Mint) con Chromium en modo kiosco como plataforma
> final. Ese plan quedó reemplazado por la app de escritorio nativa para
> Windows (WSL2 + Docker Engine + Electron), sin modo kiosco — ver
> [Despliegue en Windows](../infra/windows/README.md) y
> [Cierre de etapa: app de escritorio para Windows](windows-desktop-stage-closure.md).
> Varios de los pendientes de abajo (autologin, modo kiosco, migración a
> Linux Mint/Ubuntu Desktop) no aplican al plan vigente; se conservan como
> registro histórico.

Estado: parcialmente completada (bajo el plan Linux/kiosco original).

Completado:

- preparación de systemd;
- preparación de Chromium en modo kiosco;
- recuperación del kiosco mediante servicio de usuario;
- instalación validada en Ubuntu Server x86_64;
- base para operación offline.

Pendiente (bajo el plan histórico; ver checklist vigente en
[windows-production-checklist.md](windows-production-checklist.md) para
el plan real de hoy):

- validación limpia en Linux Mint XFCE o Ubuntu Desktop gráfico;
- usuario operativo dedicado;
- usuario técnico separado;
- autologin;
- firewall;
- SSH con llaves;
- hardening básico del sistema operativo;
- prueba de reinicio completo;
- prueba de apagón;
- migración a otra computadora;
- copia externa de backups.

Documentos relacionados:

- [Despliegue en Windows (app de escritorio)](../infra/windows/README.md)
- [Cierre de etapa: app de escritorio para Windows](windows-desktop-stage-closure.md)
- [Lista de preparación para producción — Windows](windows-production-checklist.md)
- [Despliegue (histórico, plan Linux/kiosco)](deployment.md)
- [Seguridad](security.md)
- [Solución de problemas](troubleshooting.md)

---

# Fase 6: backend base

Estado: completada en `0.2.0-alpha`.

Incluye:

- autenticación con token;
- login;
- logout;
- usuario actual;
- administración básica de usuarios;
- roles base;
- permisos por módulo;
- usuario de solo lectura;
- endpoint administrativo de estado;
- inventario;
- ubicaciones;
- productos;
- referencias de producto;
- proveedores;
- referencias proveedor-producto;
- compras;
- confirmación y anulación de compras;
- costos de importación;
- resumen de costos;
- histórico de costos append-only;
- ventas;
- confirmación y anulación de ventas;
- validación de stock suficiente;
- clientes;
- inyectores;
- accesorios;
- conteo físico;
- ajustes auditables de inventario;
- búsqueda universal;
- reportes JSON;
- documentos PDF iniciales;
- etiquetas con código de barras Code128 real;
- suite backend con 269 tests;
- reversión trazable de compras y ventas confirmadas;
- protección contra eliminación de compras, ventas y conteos finalizados.

Regla de cierre:

El backend base queda estable, pero no definitivo. No deben agregarse nuevos módulos backend sin validación desde el frontend o requerimientos reales.

Documento relacionado:

- [Cierre de backend base](backend-base-closure.md)

---

# Fase 7: frontend operativo mínimo

Estado: completada.

Objetivo:

Construir una interfaz usable que permita validar el backend con pantallas reales y flujos visibles.

Orden recomendado:

1. Login. Implementado.
2. Sesión y logout. Implementado.
3. Estado del sistema. Implementado.
4. Búsqueda universal. Implementado.
5. Productos. Implementado (listado, detalle, creación, edición, variantes original/genérico bajo el mismo código §3.6, historial de movimientos, generación de etiquetas).
6. Ubicaciones. Implementado (listado, detalle, creación, edición).
7. Proveedores. Implementado (listado, detalle, creación, edición, productos asociados).
8. Compras. Implementado (listado con filtros, detalle, creación, edición de borrador, líneas, confirmación y anulación).
9. Ventas. Implementado (listado con filtros, detalle, creación, edición de borrador, líneas, confirmación y anulación, descarga de factura interna).
10. Clientes. Implementado (listado con filtros, detalle con inyectores y ventas relacionadas, creación y edición).
11. Inyectores. Implementado (listado, detalle, creación, edición, bandeja de servicios con precio, accesorios reales de inventario y descarga de factura interna).
12. Reportes. Implementado (8 reportes operativos accesibles desde `/reports`).
13. Generación de etiquetas PDF. Implementado (desde el listado de productos).
14. Cierre de caja semanal. Implementado (solo ADMIN por ahora, §2.3).
15. Proforma. Implementado (desde el listado de productos).

Criterio de avance cumplido: la interfaz cubre todos los flujos operativos del negocio descritos
en el backlog. Lo que queda es validación con datos y usuarios reales (Fase 8), no construcción de
pantallas nuevas.

---

# Fase 8: validación con flujos reales

Estado: pendiente.

Debe incluir:

- pruebas con usuarios reales;
- revisión de campos de formularios;
- revisión de procesos de compras;
- revisión de procesos de ventas;
- revisión de inventario;
- revisión de búsqueda;
- revisión de reportes;
- revisión de impresión de etiquetas;
- revisión de roles y permisos;
- identificación de excepciones del negocio;
- ajustes al modelo según uso real.

Entregables esperados:

- lista de ajustes funcionales;
- lista de campos faltantes o innecesarios;
- lista de reportes realmente útiles;
- lista de documentos que sí deben imprimirse;
- validación del flujo diario del negocio;
- priorización de la siguiente fase.

---

# Fase 9: documentos PDF adicionales

Estado: parcialmente completada (2026-09-09).

Implementado como parte del backlog de la visita al cliente (§2.2, §2.3):

- proforma desde el listado de productos (`POST /api/documents/proforma/`), cliente opcional;
- factura interna descargable para ventas confirmadas (`GET /api/documents/sales/{id}/invoice/`);
- factura interna descargable para servicios entregados (`GET /api/documents/services/{id}/invoice/`) — un solo renglón por el precio total del servicio (incluye accesorios), con lista informativa de accesorios sin precio aparte para no duplicar el total;
- **no son comprobantes fiscales/Hacienda** — son comprobantes internos para el cliente, confirmado explícitamente con Alejandro.
- estilo visual con los colores de marca de la app (banda de encabezado, tabla con encabezado de color, filas zebra, barra de total).

Candidatos todavía sin construir (no debe avanzarse sin validar primero cuáles necesita realmente el negocio):

- catálogo interno de productos;
- reporte de productos bajo mínimo en PDF;
- reporte de compras en PDF;
- reporte de ventas en PDF;
- boleta de recepción de inyector;
- boleta de entrega de inyector;
- comparación de precios por proveedor en PDF;
- reporte de historial de movimientos en PDF.

Base técnica existente:

- app `documents`;
- ReportLab, con helpers compartidos de dibujo (`_draw_document_banner`, `_draw_customer_info_box`, `_draw_document_footer`, `_build_itemized_document_pdf` en `apps/documents/pdf.py`) reutilizados por proforma y facturas;
- endpoint inicial de etiquetas;
- código de barras Code128 real.

---

# Fase 10: migración legacy DBF

Estado: completada (2026-09-09).

Fuentes legacy migradas:

- `INVEN01`: proveedores — 73 detectados, 73 importados.
- `INVEN03`: piezas/productos — 3.655 detectados, 3.655 importados.
- `INVEN05`: compras/facturas — 13.576 líneas detectadas, 12.446 importadas en 2.079 compras
  reales confirmadas.
- `INVEN08`: stock auxiliar — usado como fuente de conciliación final.

`INVEN06` (salidas/ventas) **quedó fuera del alcance**: se verificó que está mayormente corrupto
en su origen (idéntico en ambas copias entregadas por el cliente, no es un problema de una copia
puntual) y no es reconstruible de forma confiable. En consecuencia, no se reconstruyó historial de
ventas legacy — solo el estado actual del inventario y el historial de compras.

Flujo implementado (app `apps.legacy_migration`, 4 management commands en orden):

1. Extracción (`migrate_legacy_extract`) — fusiona las dos copias entregadas por el cliente.
2. Staging (`LegacyStagingRecord`).
3. Validación (`migrate_legacy_validate`) — genera `MigrationIssue` sin tocar nada de negocio.
4. Normalización e importación (`migrate_legacy_import`) — usando los services reales
   (`confirm_purchase()`, `adjust_stock()`), idempotente.
5. Conciliación final contra `INVEN08` mediante un único movimiento `ADJUSTMENT` por producto.
6. Reporte (`migrate_legacy_report`) — totales reales, huérfanos, diferencias, errores.
7. Trazabilidad completa vía `LegacyRecordMap` (sin contaminar el modelo principal).

Regla importante (cumplida): los códigos legacy no contaminan el modelo principal — toda la
trazabilidad vive en las tablas técnicas de `apps.legacy_migration`.

Resultado: 0 errores bloqueantes. 1.797 productos sin ubicación detectable quedaron en una
ubicación `SINUB` para asignación física posterior; 1.886 productos requirieron ajuste de
conciliación; 11.291 fechas se corrigieron por un bug de año de 2 dígitos del sistema legacy nunca
corregido (Y2K). Detalle completo de hallazgos, decisiones y números en
[dbf-migration-closure.md](dbf-migration-closure.md).

Documentos relacionados:

- [Modelo de datos](data-model.md)
- [Cierre: migración legacy DBF](dbf-migration-closure.md)

---

# Fase 11: caja y procesos financieros

Estado: completada (2026-09-09), como cierre de caja semanal (§2.3 del backlog de la visita).

Definido con Alejandro antes de implementar (vía preguntas explícitas, no por suposición):

- método de pago por venta/servicio (`PaymentMethod`: efectivo, tarjeta, transferencia, otro — vive en `apps.core.models` porque `apps.customers` no puede importar de `apps.sales`);
- el cierre suma tanto ventas de producto como servicios de inyector, solo lo pagado en efectivo;
- semanas de sábado a viernes, cierre realizado los viernes;
- el total esperado (`expected_cash_total`) se congela al momento de crear el cierre — no se recalcula después;
- diferencia de efectivo con motivo obligatorio si no cuadra;
- permisos `view_cash`/`add_cash` **solo para el rol ADMIN por ahora**, decisión explícita de Alejandro ("déjalo solo admin mejor por el momento, cualquier cosa después se cambia") — no extender a otros roles sin que él lo pida de nuevo;
- sin cuentas por cobrar, sin relación con usuarios más allá de quién registra el cierre — no se pidieron, no se construyeron.

Bug real encontrado y corregido durante la implementación: un servicio podía entregarse sin precio
definido, y `SUM()` en SQL ignora silenciosamente los `NULL`, así que ese servicio desaparecía del
total de caja sin ningún error. Ahora `deliver_service()` exige precio antes de permitir la entrega.

---

# Fase 12: pruebas finales y entrega controlada

Estado: pendiente.

Debe incluir:

- pruebas unitarias;
- pruebas de integración;
- pruebas funcionales;
- pruebas de permisos;
- pruebas de backup;
- pruebas de restore;
- pruebas de actualización;
- pruebas de rollback;
- pruebas de apagón;
- pruebas de migración a otra computadora;
- pruebas con datos reales;
- capacitación;
- manual técnico;
- manual de usuario;
- plan de soporte.

Criterio final:

El sistema solo debe entregarse como producción cuando pueda instalarse, operarse, respaldarse, restaurarse, actualizarse y recuperarse de fallos de forma documentada y probada.
