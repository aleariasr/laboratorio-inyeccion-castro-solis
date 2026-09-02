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
    App de escritorio Windows (Electron + WSL2 + Docker Engine): completada.
    Frontend operativo: login, sesión, navegación, estado del sistema, búsqueda universal, productos,
    ubicaciones, proveedores, compras, costos de importación, ventas, clientes, inyectores, servicios,
    conteos físicos, movimientos de inventario, administración de usuarios, reportes y etiquetas PDF
    implementados. Ver el "Resumen funcional implementado" del README principal para el detalle completo.
    Validación con usuarios reales: pendiente.
    Migración DBF legacy: pendiente.

---

# Próxima versión: backlog de la visita a la empresa (2026-09)

Ver [`backlog-cliente-2026-09.md`](backlog-cliente-2026-09.md) para el detalle completo,
verificado contra el código real, de los 20 puntos recogidos en una visita al cliente:
inductancia/aislamiento en servicios, precio de servicios y "Tipo de Servicio" con histórico,
accesorios de servicio ligados al inventario real, cierre de caja semanal, proforma, y un
rediseño estructural del modelo de "referencia" (productos genéricos vs. originales), entre
otros. Ese documento reemplaza cualquier suposición sobre estos temas hasta que se implementen —
no se debe empezar ninguno de esos 20 puntos sin volver a leerlo primero.

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

Estado: en progreso.

Objetivo:

Construir una interfaz usable que permita validar el backend con pantallas reales y flujos visibles.

Orden recomendado:

1. Login. Implementado.
2. Sesión y logout. Implementado.
3. Estado del sistema. Implementado.
4. Búsqueda universal. Implementado.
5. Productos. Implementado (listado, detalle, creación, edición, referencias, historial de movimientos, generación de etiquetas).
6. Ubicaciones. Implementado (listado, detalle, creación, edición).
7. Proveedores. Implementado (listado, detalle, creación, edición, productos asociados).
8. Compras. Pendiente.
9. Ventas. Pendiente.
10. Clientes. Pendiente.
11. Inyectores. Pendiente.
12. Reportes. Pendiente.
13. Generación de etiquetas PDF. Implementado (desde el listado de productos).

Criterio de avance:

No se busca todavía una interfaz perfecta. Se busca una interfaz funcional, clara y suficientemente estable para validar procesos reales.

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

Estado: pendiente.

No debe avanzarse sin validar primero cuáles documentos necesita realmente el negocio.

Candidatos:

- catálogo interno de productos;
- reporte de productos bajo mínimo;
- reporte de compras;
- reporte de ventas;
- boleta de recepción de inyector;
- boleta de entrega de inyector;
- comparación de precios por proveedor;
- reporte de historial de movimientos.

Base técnica existente:

- app `documents`;
- ReportLab;
- endpoint inicial de etiquetas;
- código de barras Code128 real.

---

# Fase 10: migración legacy DBF

Estado: pendiente.

No debe implementarse sin archivos reales o muestras representativas.

Fuentes legacy identificadas:

- `INVEN01`: proveedores;
- `INVEN03`: piezas/productos;
- `INVEN05`: compras/facturas;
- `INVEN06`: salidas/ventas;
- `INVEN08`: stock auxiliar.

Flujo requerido:

1. Extracción.
2. Staging.
3. Validación.
4. Normalización.
5. Importación.
6. Conciliación.
7. Reporte de errores.
8. Trazabilidad de registros legacy.

Regla importante:

Los códigos legacy no deben contaminar el modelo principal si solo sirven para trazabilidad técnica. Esa trazabilidad debe manejarse mediante tablas o estructuras de migración.

Documento relacionado:

- [Modelo de datos](data-model.md)

---

# Fase 11: caja y procesos financieros

Estado: pendiente de requerimientos.

No debe implementarse por suposición.

Debe definirse con el cliente:

- efectivo;
- transferencias;
- cierres;
- anulaciones;
- cuentas por cobrar;
- comprobantes;
- permisos;
- reportes;
- relación con ventas;
- relación con usuarios;
- flujo de cierre diario.

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
