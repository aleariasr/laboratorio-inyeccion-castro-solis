# Despliegue

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

La infraestructura de despliegue se encuentra ampliamente implementada, sin embargo aún deben completarse los siguientes componentes antes de la primera instalación definitiva en un entorno real:

- configuración del servicio systemd;
- configuración del modo kiosco;
- configuración del firewall del sistema operativo;
- configuración de OpenSSH para soporte remoto;
- validación completa sobre hardware Linux x86_64;
- procedimiento documentado de recuperación ante fallos del sistema operativo.

Estos elementos forman parte de la fase final de preparación para producción y no afectan la arquitectura principal del proyecto.

### Preflight manual desde un release offline

Si se ejecuta `install-preflight.sh` directamente desde un paquete offline, el script detecta automáticamente el directorio `images/` ubicado junto a `app/`.

También puede indicarse explícitamente:

```bash
LICS_RELEASE_IMAGES_DIR="$PWD/images" ./app/scripts/install-preflight.sh
```

Durante la instalación normal, `install.sh` configura esta ruta automáticamente.