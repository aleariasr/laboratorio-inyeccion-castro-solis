# Despliegue

## Estado

El procedimiento productivo definitivo todavía no está implementado.

Este documento define el objetivo del despliegue, no autoriza el uso productivo de la configuración de desarrollo.

## Sistema operativo objetivo

- Linux Mint XFCE, o
- Ubuntu Desktop minimal con un entorno gráfico liviano.

## Componentes instalados en el anfitrión

- Docker Engine;
- Docker Compose;
- OpenSSH Server;
- Chromium;
- Git únicamente cuando sea necesario para soporte;
- firewall local;
- servicio de inicio automático.

## Ubicación prevista

```text
/opt/lics/
```

La instalación productiva deberá incluir:

```text
/opt/lics/app
/opt/lics/backups
/opt/lics/releases
/opt/lics/logs
/opt/lics/config
```

## Flujo de arranque

```text
Encendido del equipo
        |
        v
Inicio de Linux
        |
        v
Docker Compose
        |
        v
Healthchecks
        |
        v
Chromium en modo kiosco
        |
        v
http://localhost
```

## Restricciones

La configuración de desarrollo no debe instalarse directamente en el equipo del cliente.

Antes del despliegue se requiere:

- Compose de producción;
- imágenes versionadas;
- Gunicorn;
- frontend compilado;
- secretos productivos;
- backup y restore operativos;
- servicio systemd;
- modo kiosco;
- procedimiento de rollback;
- pruebas de reinicio y apagado abrupto.
