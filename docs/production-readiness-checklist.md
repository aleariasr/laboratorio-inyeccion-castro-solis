# Lista de preparación para producción

## Objetivo

Esta lista define los criterios mínimos que debe cumplir una versión antes de ser considerada apta para una instalación de producción.

Una versión únicamente debe liberarse cuando los elementos obligatorios se encuentren implementados, probados y documentados.

---

# Estado actual

Versión actual:

    0.2.0-alpha

Resumen:

    Infraestructura productiva base: mayormente completada.
    Backend base: completado.
    Frontend operativo: pendiente.
    Validación final en estación gráfica: pendiente.
    Validación con usuarios reales: pendiente.

Documentos relacionados:

- [README principal](../README.md)
- [Índice de documentación](index.md)
- [Cierre de backend base](backend-base-closure.md)
- [Roadmap](roadmap.md)

---

# Infraestructura

- [x] Arquitectura basada en Docker Compose.
- [x] PostgreSQL como base de datos principal.
- [x] Backend Django con Django REST Framework.
- [x] Frontend Next.js.
- [x] Proxy inverso mediante Nginx.
- [x] Separación entre desarrollo y producción.
- [x] Configuración independiente mediante archivos de entorno.
- [x] Persistencia de datos mediante volúmenes Docker.
- [x] Healthchecks para servicios principales.
- [x] Red interna dedicada para producción.
- [x] Imágenes orientadas a `linux/amd64`.

---

# Instalación

- [x] Instalación offline.
- [x] Validación del equipo antes de instalar.
- [x] Validación de arquitectura soportada.
- [x] Verificación de integridad mediante SHA-256.
- [x] Carga de imágenes Docker desde archivos locales.
- [x] Generación automática de secretos.
- [x] Instalación en directorio dedicado.
- [x] Inicialización automática de PostgreSQL.
- [x] Ejecución automática de migraciones.
- [x] Creación idempotente de roles base.
- [x] Healthcheck posterior a la instalación.
- [x] Protección contra segunda instalación accidental.
- [x] Instalación validada en Ubuntu Server x86_64.
- [ ] Instalación limpia validada en Linux Mint XFCE o Ubuntu Desktop gráfico.

---

# Servicios

- [x] PostgreSQL con almacenamiento persistente.
- [x] Backend saludable.
- [x] Frontend saludable.
- [x] Nginx saludable.
- [x] Healthchecks configurados para servicios principales.
- [x] Inicio sin construir imágenes.
- [x] Inicio sin descargar imágenes.
- [x] Inicio utilizando imágenes locales.

---

# Backups

- [x] Respaldo lógico mediante `pg_dump`.
- [x] Validación mediante `pg_restore`.
- [x] Generación de metadatos.
- [x] Generación de checksums SHA-256.
- [x] Respaldo preventivo antes de restaurar.
- [x] Verificación automática de respaldos.
- [x] Restauración de prueba validada.
- [x] Restauración productiva validada.
- [x] Backups automáticos.
- [x] Retención local.
- [ ] Copia automática a medio externo.
- [ ] Prueba periódica programada de restauración.

---

# Restauración

- [x] Validación del respaldo antes de restaurar.
- [x] Validación de compatibilidad.
- [x] Confirmación explícita del operador.
- [x] Backup preventivo antes de modificar la base.
- [x] Detención controlada de la aplicación.
- [x] Cierre de conexiones activas.
- [x] Recreación segura de la base de datos.
- [x] Validación posterior de la restauración.
- [x] Reinicio automático de la aplicación.
- [x] Healthcheck posterior a la restauración.
- [x] Restauración sin afectar otras bases de datos.

---

# Seguridad

- [x] Secretos fuera del repositorio Git.
- [x] Generación automática de credenciales.
- [x] Archivo `.env.prod` con permisos restringidos.
- [x] Aplicación accesible mediante Nginx local.
- [x] Servicios internos sin exposición directa.
- [x] Separación entre desarrollo y producción.
- [x] Integridad del paquete validada mediante SHA-256.
- [x] Backend y frontend ejecutados como usuarios no root dentro de contenedores productivos.
- [x] `DEBUG=False` en producción.
- [x] Roles y permisos base de aplicación.
- [ ] Usuario operativo dedicado.
- [ ] Usuario técnico separado.
- [ ] Firewall configurado.
- [ ] SSH únicamente mediante autenticación por llaves.
- [ ] Endurecimiento final del sistema operativo.

---

# Actualizaciones

- [x] Versionado del proyecto.
- [x] Archivo `VERSION`.
- [x] Historial de cambios.
- [x] Paquete offline versionado.
- [x] Verificación de integridad.
- [x] Backup obligatorio antes de modificar la base de datos.
- [x] Validación posterior mediante healthchecks.
- [x] Automatización del proceso de actualización.
- [x] Estrategia de rollback productivo validada.
- [ ] Validación completa del flujo sobre estación gráfica objetivo.

---

# Operación

- [x] Scripts de instalación.
- [x] Scripts de inicio.
- [x] Scripts de parada.
- [x] Reinicio controlado.
- [x] Consulta de estado.
- [x] Healthcheck integral.
- [x] Backup manual.
- [x] Verificación de backups.
- [x] Restauración de prueba.
- [x] Restauración productiva.
- [x] Arranque automático preparado mediante systemd.
- [x] Chromium en modo kiosco preparado.
- [x] Recuperación automática del modo kiosco preparada mediante systemd user service.
- [ ] Configuración definitiva del sistema operativo.
- [ ] Validación final de autologin.
- [ ] Validación final de modo kiosco en equipo objetivo.

---

# Backend base

- [x] Autenticación.
- [x] Login.
- [x] Logout.
- [x] Usuario actual.
- [x] Administración básica de usuarios.
- [x] Roles base.
- [x] Permisos por módulo.
- [x] Usuario de solo lectura.
- [x] Estado administrativo del sistema.
- [x] Inventario.
- [x] Compras.
- [x] Costos.
- [x] Ventas.
- [x] Clientes.
- [x] Inyectores.
- [x] Búsqueda universal.
- [x] Reportes JSON.
- [x] Documentos PDF iniciales.
- [x] Etiquetas con código de barras real.
- [x] Suite backend con 226 tests.

---

# Frontend

- [ ] Login.
- [ ] Logout.
- [ ] Estado del sistema.
- [ ] Búsqueda universal.
- [ ] Productos.
- [ ] Ubicaciones.
- [ ] Proveedores.
- [ ] Compras.
- [ ] Ventas.
- [ ] Clientes.
- [ ] Inyectores.
- [ ] Reportes.
- [ ] Generación de etiquetas PDF desde interfaz.

---

# Datos reales y requerimientos

- [ ] Validación con usuarios reales.
- [ ] Validación con datos reales.
- [ ] Revisión de campos requeridos.
- [ ] Revisión de flujos de compras.
- [ ] Revisión de flujos de ventas.
- [ ] Revisión de flujos de inventario.
- [ ] Revisión de reportes necesarios.
- [ ] Revisión de documentos imprimibles.
- [ ] Revisión de permisos reales.
- [ ] Priorización de ajustes posteriores.

---

# Migración legacy DBF

- [ ] Obtener archivos reales o muestras representativas.
- [ ] Analizar estructura de tablas DBF.
- [ ] Diseñar extracción.
- [ ] Diseñar staging.
- [ ] Diseñar validaciones.
- [ ] Diseñar normalización.
- [ ] Importar datos de prueba.
- [ ] Conciliar stock.
- [ ] Generar reporte de migración.
- [ ] Documentar errores bloqueantes y advertencias.

---

# Validación operativa pendiente

- [ ] Instalación limpia en Linux Mint XFCE.
- [ ] Instalación limpia en Ubuntu Desktop.
- [x] Instalación limpia en Ubuntu Server x86_64.
- [x] Prueba completa sobre hardware físico x86_64.
- [ ] Reinicio completo del equipo.
- [ ] Recuperación después de apagado inesperado.
- [ ] Recuperación después de reiniciar Docker.
- [ ] Recuperación con poco espacio disponible.
- [x] Prueba documentada de actualización offline.
- [x] Prueba documentada de backup.
- [x] Prueba documentada de verificación de backup.
- [x] Prueba documentada de restauración de prueba.
- [x] Prueba documentada de restauración productiva.
- [x] Prueba documentada de rollback.
- [ ] Validación completa del procedimiento de soporte.

---

# Criterio de liberación

Una versión puede considerarse lista para producción únicamente cuando:

- la infraestructura obligatoria se encuentre implementada;
- los backups y restauraciones estén probados;
- el proceso de actualización esté probado;
- la instalación objetivo haya sido validada sobre el equipo final;
- el sistema se recupere después de reinicios y fallos razonables;
- el frontend operativo cubra los flujos requeridos;
- los usuarios hayan validado los procesos principales;
- la documentación técnica y operativa esté actualizada;
- exista un procedimiento claro de soporte y recuperación.
