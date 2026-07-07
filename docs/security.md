# Seguridad

## Principios

- mínimo privilegio;
- separación entre usuario operador y usuario técnico;
- secretos fuera del repositorio;
- acceso remoto restringido;
- servicios internos no expuestos;
- registro de acciones administrativas;
- backups protegidos.

## Secretos

Nunca deben confirmarse en Git:

- contraseñas;
- claves de Django;
- credenciales de PostgreSQL;
- claves SSH privadas;
- archivos `.env`;
- respaldos con información real.

## Red

Solamente Nginx debe publicar un puerto hacia el anfitrión.

PostgreSQL, Django y Next.js deben permanecer dentro de la red interna de Docker.

## SSH

En producción:

- acceso exclusivo para soporte autorizado;
- autenticación mediante llave;
- contraseña deshabilitada cuando sea posible;
- acceso root directo deshabilitado;
- firewall limitado a la red de mantenimiento.

## Django

Producción deberá usar:

```text
DEBUG=False
```

También deberá configurar:

- `ALLOWED_HOSTS`;
- cookies seguras cuando aplique;
- protección CSRF;
- encabezados de seguridad;
- límites de sesión;
- bloqueo o control de intentos;
- auditoría de accesos.

## Operadores

El usuario que utiliza el sistema no debe tener permisos administrativos sobre Linux ni Docker.

## Controles implementados actualmente

- Secretos excluidos de Git.
- `.env.prod` generado durante instalación.
- `.env.prod` con permisos restringidos.
- Nginx como único punto de entrada.
- Servicios internos sin exposición directa.
- Backend y frontend ejecutados como usuarios no root dentro de sus contenedores.
- `no-new-privileges` configurado en producción.
- `DEBUG=False` en producción.
- Encabezados básicos de seguridad configurados en Nginx.
- Backups con permisos restrictivos.
- Restauración productiva con confirmación explícita y backup preventivo.

## Controles pendientes

- Usuario operativo del sistema operativo.
- Usuario técnico separado.
- SSH con llaves.
- Firewall.
- Hardening del sistema operativo.
- Política de recuperación de credenciales administrativas.