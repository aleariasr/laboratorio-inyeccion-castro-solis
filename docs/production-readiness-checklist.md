# Lista de preparación para producción

Un release no podrá entregarse al cliente hasta completar esta lista.

## Instalación

- [ ] Instalación limpia en Ubuntu o Linux Mint x86_64.
- [ ] Instalación completamente offline.
- [ ] Validación de checksums.
- [ ] Carga de cuatro imágenes.
- [ ] Generación de secretos.
- [ ] Creación de `/opt/lics`.
- [ ] Migraciones iniciales.
- [ ] Healthcheck final.
- [ ] Segundo intento de instalación rechazado de forma segura.

## Reinicio

- [ ] Servicios levantan después de reiniciar Linux.
- [ ] PostgreSQL conserva los datos.
- [ ] Chromium abre automáticamente.
- [ ] Chromium espera a que la aplicación esté disponible.
- [ ] El kiosco se recupera si Chromium se cierra.
- [ ] El kiosco no muestra páginas de error durante el arranque.

## Backups

- [ ] Backup manual.
- [ ] Backup automático.
- [ ] Retención diaria.
- [ ] Retención semanal.
- [ ] Copia a medio externo.
- [ ] Detección de corrupción.
- [ ] Restore temporal.
- [ ] Restore productivo.
- [ ] Registro de fecha del último backup.
- [ ] Prueba documentada de restauración.

## Fallos

- [ ] Apagado inesperado.
- [ ] Reinicio durante uso.
- [ ] Contenedor detenido.
- [ ] Docker detenido.
- [ ] Disco casi lleno.
- [ ] Backup corrupto.
- [ ] Actualización fallida.
- [ ] Migración fallida.
- [ ] Contraseña administrativa perdida.
- [ ] Equipo reemplazado.

## Seguridad

- [ ] `.env.prod` con permisos `600`.
- [ ] `/opt/lics` con permisos correctos.
- [ ] Backups protegidos.
- [ ] Usuario operativo sin sudo.
- [ ] Usuario técnico separado.
- [ ] SSH mediante llaves.
- [ ] Firewall activo.
- [ ] Solo puertos necesarios.
- [ ] Aplicación enlazada a localhost.
- [ ] Secretos ausentes de Git y releases.

## Actualización

- [ ] Release versionado.
- [ ] Checksum del paquete.
- [ ] Backup pre-update.
- [ ] Validación de versión origen.
- [ ] Carga de imágenes.
- [ ] Migraciones.
- [ ] Healthcheck.
- [ ] Rollback.
- [ ] Historial de actualización.
- [ ] Actualización sin Internet.

## Soporte

- [ ] Manual de instalación.
- [ ] Manual de actualización.
- [ ] Manual de backup.
- [ ] Manual de restore.
- [ ] Manual de diagnóstico.
- [ ] Comando de exportación de logs.
- [ ] Procedimiento de migración a otra computadora.
- [ ] Inventario de versiones instaladas.