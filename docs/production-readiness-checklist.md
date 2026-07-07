# Lista de preparación para producción

## Objetivo

Esta lista define los criterios mínimos que debe cumplir una versión antes de ser considerada apta para una instalación de producción.

Una versión únicamente puede liberarse cuando todos los elementos obligatorios se encuentren completados y validados.

---

# Infraestructura

- [x] Arquitectura basada en Docker Compose.
- [x] PostgreSQL como base de datos principal.
- [x] Backend Django con Django REST Framework.
- [x] Frontend Next.js.
- [x] Proxy inverso mediante Nginx.
- [x] Separación entre desarrollo y producción.
- [x] Configuración independiente mediante archivos de entorno.

---

# Instalación

- [x] Instalación completamente offline.
- [x] Validación del equipo antes de instalar.
- [x] Validación de arquitectura soportada.
- [x] Verificación de integridad mediante SHA-256.
- [x] Carga de imágenes Docker desde archivos locales.
- [x] Generación automática de secretos.
- [x] Instalación en directorio dedicado.
- [x] Inicialización de PostgreSQL.
- [x] Ejecución automática de migraciones.
- [x] Healthcheck posterior a la instalación.
- [x] Protección contra una segunda instalación sobre una instalación existente.

---

# Servicios

- [x] PostgreSQL con almacenamiento persistente.
- [x] Backend saludable.
- [x] Frontend saludable.
- [x] Nginx saludable.
- [x] Healthchecks configurados para todos los servicios.
- [x] Inicio sin construir imágenes.
- [x] Inicio sin descargar imágenes.

---

# Backups

- [x] Respaldo lógico mediante pg_dump.
- [x] Validación mediante pg_restore.
- [x] Generación de metadatos.
- [x] Generación de checksums.
- [x] Respaldo preventivo antes de restaurar.
- [x] Verificación automática de respaldos.
- [x] Restauración validada.
- [ ] Política automática de respaldos.
- [ ] Política automática de retención.
- [ ] Copia automática a medio externo.

---

# Restauración

- [x] Validación del respaldo antes de restaurar.
- [x] Validación de compatibilidad.
- [x] Confirmación explícita del operador.
- [x] Detención controlada de la aplicación.
- [x] Recreación segura de la base de datos.
- [x] Validación posterior de la restauración.
- [x] Reinicio automático del sistema.
- [x] Healthcheck posterior a la restauración.

---

# Seguridad

- [x] Secretos fuera del repositorio Git.
- [x] Generación automática de credenciales.
- [x] Archivo `.env.prod` con permisos restringidos.
- [x] Aplicación accesible mediante localhost.
- [x] Separación entre desarrollo y producción.
- [ ] Usuario operativo dedicado.
- [ ] Usuario técnico separado.
- [ ] Firewall configurado.
- [ ] SSH mediante autenticación por llaves.
- [ ] Endurecimiento del sistema operativo.

---

# Actualizaciones

- [x] Versionado del proyecto.
- [x] Archivo VERSION.
- [x] Historial de cambios.
- [x] Paquete offline versionado.
- [x] Verificación de integridad.
- [x] Backup obligatorio antes de modificar la base de datos.
- [x] Validación posterior mediante healthchecks.
- [ ] Automatización completa del proceso de actualización.
- [ ] Estrategia definitiva de rollback.

---

# Operación

- [x] Scripts de inicio.
- [x] Scripts de parada.
- [x] Reinicio controlado.
- [x] Consulta de estado.
- [x] Healthcheck integral.
- [x] Instalación automatizada.
- [ ] Arranque automático mediante systemd.
- [ ] Chromium en modo kiosco.
- [ ] Recuperación automática del modo kiosco.
- [ ] Configuración definitiva del sistema operativo.

---

# Validación

- [ ] Instalación limpia en Linux Mint XFCE.
- [ ] Instalación limpia en Ubuntu LTS.
- [ ] Prueba completa sobre hardware físico x86_64.
- [ ] Reinicio completo del equipo.
- [ ] Recuperación después de un apagado inesperado.
- [ ] Recuperación después de detener Docker.
- [ ] Recuperación con poco espacio disponible.
- [ ] Prueba documentada de actualización.
- [ ] Prueba documentada de restauración.
- [ ] Validación completa del procedimiento de soporte.

---

# Aplicación

La infraestructura deberá encontrarse completamente validada antes de iniciar el desarrollo de funcionalidades de negocio.

Los siguientes componentes pertenecen a la siguiente fase del proyecto:

- autenticación;
- gestión de usuarios;
- configuración de empresa;
- roles y permisos;
- modelo de datos;
- inventario;
- ventas;
- caja;
- reportes;
- demás módulos funcionales.

---

# Criterio de liberación

Una versión únicamente podrá considerarse lista para una instalación de producción cuando:

- todos los componentes obligatorios de infraestructura se encuentren implementados;
- las pruebas críticas hayan sido ejecutadas satisfactoriamente;
- la documentación técnica esté actualizada;
- los procedimientos de respaldo y restauración hayan sido verificados;
- el entorno objetivo haya sido validado sobre hardware Linux x86_64.