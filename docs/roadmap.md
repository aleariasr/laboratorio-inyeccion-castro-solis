# Roadmap del proyecto

## Principio general

El proyecto LICS se desarrolla por fases, priorizando estabilidad, mantenibilidad, seguridad, recuperación ante fallos, trazabilidad, operación offline y facilidad de soporte técnico.

No se considera definitivo ningún flujo de negocio hasta validarlo con usuarios reales, datos reales y pantallas operativas.

El backend base ya existe, pero no debe seguir ampliándose por suposición. La siguiente fase recomendada es construir el frontend operativo mínimo para probar los flujos reales del negocio.

---

# Estado actual

Versión actual:

    0.2.0-alpha

Estado resumido:

    Infraestructura productiva base: completada.
    Backend base: completado.
    Frontend operativo: pendiente.
    Validación con usuarios reales: pendiente.
    Migración DBF legacy: pendiente.

Documentos relacionados:

- [README principal](../README.md)
- [Índice de documentación](index.md)
- [Cierre de backend base](backend-base-closure.md)
- [Cierre de infraestructura productiva base](infrastructure-stage-closure.md)
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

- probar el flujo completo sobre la estación gráfica objetivo;
- validar recuperación después de reiniciar el equipo;
- validar recuperación después de apagón o corte inesperado.

Documentos relacionados:

- [Despliegue](deployment.md)
- [Proceso de actualización](update-process.md)
- [Lista de preparación para producción](production-readiness-checklist.md)

---

# Fase 5: sistema operativo, soporte y modo kiosco

Estado: parcialmente completada.

Completado:

- preparación de systemd;
- preparación de Chromium en modo kiosco;
- recuperación del kiosco mediante servicio de usuario;
- instalación validada en Ubuntu Server x86_64;
- base para operación offline.

Pendiente:

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

- [Despliegue](deployment.md)
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
- suite backend con 251 tests;
- reversión trazable de compras y ventas confirmadas;
- protección contra eliminación de compras, ventas y conteos finalizados.

Regla de cierre:

El backend base queda estable, pero no definitivo. No deben agregarse nuevos módulos backend sin validación desde el frontend o requerimientos reales.

Documento relacionado:

- [Cierre de backend base](backend-base-closure.md)

---

# Fase 7: frontend operativo mínimo

Estado: siguiente fase recomendada.

Objetivo:

Construir una interfaz usable que permita validar el backend con pantallas reales y flujos visibles.

Orden recomendado:

1. Login.
2. Sesión y logout.
3. Estado del sistema.
4. Búsqueda universal.
5. Productos.
6. Ubicaciones.
7. Proveedores.
8. Compras.
9. Ventas.
10. Clientes.
11. Inyectores.
12. Reportes.
13. Generación de etiquetas PDF.

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
