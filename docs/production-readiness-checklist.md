# Lista de preparación para producción

## Objetivo

Esta lista define los criterios mínimos que debe cumplir una versión antes de ser considerada apta para una instalación de producción.

Una versión únicamente podrá liberarse cuando todos los elementos obligatorios se encuentren implementados, probados y documentados.

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
- [x] Healthchecks para todos los servicios.
- [x] Red interna dedicada para producción.

---

# Instalación

- [x] Instalación completamente offline.
- [x] Validación del equipo antes de instalar.
- [x] Validación de arquitectura soportada.
- [x] Verificación de integridad mediante SHA-256.
- [x] Carga de imágenes Docker desde archivos locales.
- [x] Generación automática de secretos.
- [x] Instalación en directorio dedicado (`/opt/lics`).
- [x] Inicialización automática de PostgreSQL.
- [x] Ejecución automática de migraciones.
- [x] Healthcheck posterior a la instalación.
- [x] Protección contra una segunda instalación sobre una instalación existente.
- [x] Instalación validada en Ubuntu Server x86_64 sobre hardware físico.

---

# Servicios

- [x] PostgreSQL con almacenamiento persistente.
- [x] Backend saludable.
- [x] Frontend saludable.
- [x] Nginx saludable.
- [x] Healthchecks configurados para todos los servicios.
- [x] Inicio sin construir imágenes.
- [x] Inicio sin descargar imágenes.
- [x] Inicio utilizando únicamente imágenes locales.

---

# Backups

- [x] Respaldo lógico mediante pg_dump.
- [x] Validación mediante pg_restore.
- [x] Generación de metadatos.
- [x] Generación de checksums SHA-256.
- [x] Respaldo preventivo antes de restaurar.
- [x] Verificación automática de respaldos.
- [x] Restauración de prueba completamente validada.
- [x] Restauración productiva completamente validada.
- [ ] Política automática de respaldos.
- [ ] Política automática de retención.
- [ ] Copia automática a medio externo.

---

# Restauración

- [x] Validación del respaldo antes de restaurar.
- [x] Validación de compatibilidad.
- [x] Confirmación explícita del operador.
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
- [x] Aplicación accesible únicamente mediante localhost.
- [x] Separación entre desarrollo y producción.
- [x] Integridad del paquete validada mediante SHA-256.
- [ ] Usuario operativo dedicado.
- [ ] Usuario técnico separado.
- [ ] Firewall configurado.
- [ ] SSH únicamente mediante autenticación por llaves.
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
- [ ] Arranque automático mediante systemd.
- [ ] Chromium en modo kiosco.
- [ ] Recuperación automática del modo kiosco.
- [ ] Configuración definitiva del sistema operativo.

---

# Validación

- [ ] Instalación limpia en Linux Mint XFCE.
- [x] Instalación limpia en Ubuntu Server LTS x86_64.
- [x] Prueba completa sobre hardware físico x86_64.
- [ ] Reinicio completo del equipo.
- [ ] Recuperación después de un apagado inesperado.
- [ ] Recuperación después de reiniciar Docker.
- [ ] Recuperación con poco espacio disponible.
- [ ] Prueba documentada de actualización offline.
- [x] Prueba documentada de backup.
- [x] Prueba documentada de verificación de backup.
- [x] Prueba documentada de restauración de prueba.
- [x] Prueba documentada de restauración productiva.
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

Una versión únicamente podrá considerarse lista para producción cuando:

- toda la infraestructura obligatoria se encuentre implementada;
- todas las pruebas críticas hayan sido ejecutadas satisfactoriamente;
- la documentación técnica esté actualizada;
- los procedimientos de respaldo y restauración hayan sido verificados;
- el procedimiento de actualización haya sido validado;
- el entorno objetivo haya sido probado sobre hardware Linux x86_64;
- el sistema pueda recuperarse automáticamente después de un reinicio del equipo.