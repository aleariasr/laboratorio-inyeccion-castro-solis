# Despliegue

> Estado actualizado: la instalación offline base y el backend operativo inicial ya fueron validados. Las validaciones finales pendientes corresponden principalmente al entorno gráfico objetivo, hardening, soporte técnico y operación con usuarios reales.

## Objetivo

Definir el proceso de instalación y despliegue del sistema en un equipo destinado a operar como estación de trabajo de producción.

La arquitectura está diseñada para funcionar completamente offline una vez instalada, utilizando únicamente recursos locales.

---

# Plataforma objetivo

La instalación de producción está orientada a equipos con arquitectura **x86_64 (amd64)**.

Sistemas operativos soportados:

- Ubuntu Desktop LTS (instalación mínima).
- Linux Mint XFCE.

El proyecto no considera actualmente otros sistemas operativos como plataforma de producción.

---

# Arquitectura de despliegue

```text
Equipo Linux
        │
        ▼
Docker Engine
        │
        ▼
Docker Compose
        │
        ▼
────────────────────────────────────
│ PostgreSQL                      │
│ Django + Django REST Framework  │
│ Next.js                         │
│ Nginx                           │
────────────────────────────────────
        │
        ▼
http://localhost
        │
        ▼
Chromium (modo kiosco)
```

Todos los servicios se ejecutan mediante Docker Compose utilizando una red privada interna.

---

# Instalación

La instalación productiva se realiza a partir de un paquete offline previamente generado.

El proceso automatizado incluye:

- validación del equipo destino;
- validación de arquitectura;
- validación de Docker Engine;
- validación de Docker Compose;
- comprobación de integridad del paquete mediante SHA-256;
- carga de imágenes Docker;
- generación automática de secretos;
- instalación en el directorio de producción;
- inicialización de PostgreSQL;
- ejecución de migraciones;
- arranque de todos los servicios;
- comprobación automática del estado del sistema.

---

# Directorio de instalación

La instalación utiliza como ubicación predeterminada:

```text
/opt/lics
```

Desde este directorio se ejecutan todos los componentes del sistema.

La instalación incluye, entre otros:

```text
/opt/lics/
│
├── backend/
├── frontend/
├── infra/
├── scripts/
├── docs/
├── VERSION
└── CHANGELOG.md
```

Los respaldos y la información persistente permanecen fuera de los contenedores Docker.

---

# Flujo de instalación

```text
Paquete offline
        │
        ▼
install-preflight.sh
        │
        ▼
Validación del equipo
        │
        ▼
Verificación de checksums
        │
        ▼
Carga de imágenes Docker
        │
        ▼
Generación de configuración
        │
        ▼
Migraciones iniciales
        │
        ▼
Inicio de servicios
        │
        ▼
Healthcheck
        │
        ▼
Sistema listo
```

---

# Operación del sistema

Una vez instalado, la administración del sistema se realiza mediante los scripts ubicados en:

```text
/opt/lics/scripts/
```

Las operaciones disponibles incluyen:

- iniciar el sistema;
- detener el sistema;
- reiniciar servicios;
- consultar estado;
- ejecutar comprobaciones de salud;
- crear respaldos;
- restaurar respaldos;
- verificar respaldos.

---

# Separación de entornos

## Desarrollo

Características:

- código fuente montado como volumen;
- herramientas de desarrollo habilitadas;
- recarga automática cuando aplica;
- configuración mediante `.env`.

Este entorno está destinado exclusivamente al desarrollo del software.

---

## Producción

Características:

- imágenes Docker versionadas;
- frontend compilado;
- Gunicorn como servidor de aplicaciones;
- configuración independiente mediante `.env.prod`;
- instalación offline;
- imágenes cargadas localmente;
- servicios ejecutados sin construir imágenes durante el arranque.

El entorno de producción no depende del repositorio Git ni de acceso a Internet para operar.

---

# Requisitos de producción

Para considerar una instalación apta para producción deben cumplirse, como mínimo, las siguientes condiciones:

- instalación completamente offline;
- verificación de integridad del paquete;
- generación automática de secretos;
- almacenamiento persistente de la base de datos;
- healthchecks satisfactorios para todos los servicios;
- procedimiento documentado de respaldo y restauración;
- procedimiento documentado de actualización.

---

# Componentes pendientes

La instalación offline base ya fue validada en Ubuntu Server 26.04 LTS x86_64 y el backend base quedó cerrado en versión `0.2.0-alpha`.

Quedan pendientes para cierre operativo completo:

- validación limpia sobre Linux Mint XFCE o Ubuntu Desktop gráfico;
- configuración definitiva del usuario operativo;
- autologin;
- validación del modo kiosco en el equipo objetivo;
- SSH para soporte técnico con llaves;
- firewall;
- hardening básico del sistema operativo;
- copia externa de respaldos a USB o disco externo;
- pruebas de apagón y reinicio completo;
- migración completa a otra computadora;
- validación con usuarios reales;
- validación con datos reales.

### Preflight manual desde un release offline

Si se ejecuta `install-preflight.sh` directamente desde un paquete offline, el script detecta automáticamente el directorio `images/` ubicado junto a `app/`.

También puede indicarse explícitamente:

```bash
LICS_RELEASE_IMAGES_DIR="$PWD/images" ./app/scripts/install-preflight.sh
```

Durante la instalación normal, `install.sh` configura esta ruta automáticamente.

## Documentación relacionada

- [README principal](../README.md)
- [Índice de documentación](index.md)
- [Arquitectura](architecture.md)
- [Estructura de producción](production-layout.md)
- [Backups y restauración](backup-restore.md)
- [Proceso de actualización](update-process.md)
- [Solución de problemas](troubleshooting.md)
- [Cierre de backend base](backend-base-closure.md)
