# Estructura de instalación en producción

LICS utiliza /opt/lics como raíz de instalación productiva actual.

## Estado actual

La instalación inicial coloca la aplicación directamente en:

    /opt/lics

Los scripts operativos se ejecutan desde:

    /opt/lics/scripts

Este diseño ya fue validado con instalación offline, carga de imágenes, migraciones, backup, restore y healthchecks.

## Regla actual

Mientras no exista update.sh ni rollback.sh, la ruta productiva estable es:

    /opt/lics

El servicio systemd debe apuntar a esa ruta.

## Evolución futura

Cuando se implemente el proceso de actualización offline y rollback, se evaluará migrar a una estructura versionada como:

    /opt/lics/
    ├── current -> /opt/lics/releases/<version-activa>
    ├── releases/
    ├── backups/
    ├── incoming/
    ├── logs/
    └── shared/

Esa migración no debe hacerse antes de tener update.sh y rollback.sh, porque modificaría una instalación ya validada sin aportar valor inmediato.

## Decisión

Para Fase 1 systemd, se mantiene /opt/lics.

La estructura current/releases queda reservada para las fases de actualización y rollback.
