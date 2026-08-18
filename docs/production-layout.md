# Estructura de instalación en producción

> **Nota:** este documento sigue vigente para lo que describe (la
> estructura de `/opt/lics` dentro de la distro WSL2 en la instalación de
> Windows), no solo para el plan Linux original. `/opt/lics` es la misma
> ruta que usa la app de escritorio de Windows, corriendo dentro de la
> distro `lics-wsl` — ver [Despliegue en Windows](../infra/windows/README.md).

LICS utiliza /opt/lics como raíz de instalación productiva actual.

## Estado actual

La instalación inicial coloca la aplicación directamente en:

    /opt/lics

Los scripts operativos se ejecutan desde:

    /opt/lics/scripts

Este diseño ya fue validado con instalación offline, carga de imágenes, migraciones, backup, restore y healthchecks.

## Regla actual

`scripts/update.sh` y `scripts/rollback.sh` ya existen y fueron validados (ver [Cierre de infraestructura productiva base](infrastructure-stage-closure.md) y [Lista de preparación para producción](production-readiness-checklist.md)). La condición que este documento fijaba para reevaluar la estructura de instalación ya se cumplió.

Mientras no se decida explícitamente migrar a una estructura versionada, la ruta productiva estable sigue siendo:

    /opt/lics

El servicio systemd debe apuntar a esa ruta.

## Evolución futura

Con `update.sh` y `rollback.sh` ya implementados, corresponde evaluar si conviene migrar a una estructura versionada como:

    /opt/lics/
    ├── current -> /opt/lics/releases/<version-activa>
    ├── releases/
    ├── backups/
    ├── incoming/
    ├── logs/
    └── shared/

Esta migración no se ha decidido todavía. Debe evaluarse explícitamente, no asumirse, considerando si aporta valor real frente al riesgo de modificar una instalación ya validada en producción.

## Decisión

Se mantiene /opt/lics como ruta productiva estable.

La migración a una estructura current/releases queda pendiente de una decisión explícita, ahora que ya existen los scripts de actualización y rollback que la habilitarían.
