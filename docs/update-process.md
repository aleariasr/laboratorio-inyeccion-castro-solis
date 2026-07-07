# Proceso de actualización

## Objetivo

Definir el procedimiento para actualizar una instalación existente de forma segura, reproducible y completamente offline.

Las actualizaciones se distribuyen mediante paquetes versionados que contienen el código de la aplicación, las imágenes Docker y la información necesaria para validar la integridad del paquete antes de modificar la instalación existente.

El proceso debe garantizar que una actualización nunca comprometa la información almacenada por el sistema.

---

# Principios

Toda actualización debe cumplir los siguientes principios:

- funcionamiento completamente offline;
- instalación reproducible;
- respaldo obligatorio antes de modificar la base de datos;
- verificación de integridad del paquete;
- validación del entorno antes de iniciar;
- confirmación del estado del sistema al finalizar;
- posibilidad de recuperación ante fallos.

---

# Paquete de actualización

Cada versión distribuida debe contener, como mínimo:

```text id="v9q7ku"
VERSION
manifest.txt
SHA256SUMS

images/
app/
```

El paquete debe ser autosuficiente y no depender de acceso a Internet durante la actualización.

---

# Flujo general

```text id="1hl76f"
Paquete offline
        │
        ▼
Validación del equipo
        │
        ▼
Verificación de integridad
        │
        ▼
Validación de versión
        │
        ▼
Backup obligatorio
        │
        ▼
Carga de imágenes
        │
        ▼
Actualización de la aplicación
        │
        ▼
Migraciones
        │
        ▼
Inicio del sistema
        │
        ▼
Healthcheck
        │
        ▼
Confirmación de la actualización
```

Cada etapa debe finalizar correctamente antes de continuar con la siguiente.

---

# Validaciones previas

Antes de iniciar una actualización deben verificarse como mínimo:

- compatibilidad del sistema operativo;
- arquitectura soportada;
- disponibilidad de Docker Engine;
- disponibilidad de Docker Compose;
- espacio libre en disco;
- integridad del paquete mediante SHA-256;
- estado saludable del sistema actual.

Si cualquiera de estas comprobaciones falla, la actualización debe cancelarse sin modificar la instalación existente.

---

# Respaldo obligatorio

Antes de ejecutar cualquier migración o reemplazar archivos de la aplicación debe generarse un respaldo completo de la base de datos.

El respaldo debe:

- completarse correctamente;
- validarse mediante `pg_restore`;
- generar metadatos;
- generar checksums;
- almacenarse antes de continuar.

La actualización nunca debe continuar si el respaldo falla.

---

# Migraciones

Las migraciones de base de datos deben ejecutarse únicamente después de:

- validar el paquete;
- instalar la nueva versión;
- cargar las imágenes necesarias;
- comprobar la disponibilidad de PostgreSQL.

Las migraciones deben ejecutarse una única vez por actualización.

---

# Verificación posterior

Al finalizar la actualización debe verificarse:

- estado saludable de PostgreSQL;
- estado saludable del backend;
- estado saludable del frontend;
- estado saludable de Nginx;
- respuesta correcta de los endpoints de salud;
- versión reportada por el backend;
- disponibilidad de archivos estáticos.

La actualización no debe considerarse exitosa hasta completar todas estas comprobaciones.

---

# Recuperación ante fallos

Si ocurre un error antes de modificar la base de datos, la actualización debe cancelarse sin afectar la instalación existente.

Si el error ocurre después de modificar la instalación, el procedimiento de recuperación debe apoyarse en el respaldo generado previamente.

La estrategia definitiva de rollback automático se implementará en una etapa posterior del proyecto.

---

# Versionado

Todas las versiones del sistema utilizan versionado semántico (Semantic Versioning).

Formato:

```text id="hv5s0y"
MAJOR.MINOR.PATCH
```

Ejemplos:

```text id="s8z8bd"
1.0.0
1.2.5
2.0.0
```

Cada paquete distribuido debe incluir el archivo `VERSION` correspondiente a la versión instalada.

---

# Restricciones

Durante una actualización no debe:

- copiarse manualmente código sobre una instalación activa;
- modificarse directamente la base de datos;
- reutilizarse paquetes cuya integridad no haya sido verificada;
- omitirse el respaldo previo;
- eliminarse una instalación válida antes de confirmar el correcto funcionamiento de la nueva versión.

---

# Estado actual

La infraestructura del proyecto ya incorpora los componentes necesarios para soportar un proceso de actualización controlado, incluyendo:

- paquetes offline versionados;
- validación de integridad mediante SHA-256;
- generación de respaldos verificables;
- migraciones de base de datos;
- comprobaciones automáticas de salud.

La automatización completa del proceso de actualización y la estrategia definitiva de rollback forman parte de la fase final de preparación para producción.