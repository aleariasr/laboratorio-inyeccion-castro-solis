# Backups y restauración

## Objetivo

Garantizar la recuperación de la información mediante respaldos verificables y un procedimiento de restauración controlado.

La estrategia de respaldo está diseñada para minimizar el riesgo de pérdida de datos y asegurar que toda restauración pueda realizarse de forma repetible y validada.

---

# Estrategia de respaldo

El sistema utiliza respaldos **lógicos** de PostgreSQL generados mediante:

```text
pg_dump
```

No se realizan copias directas del volumen de datos mientras PostgreSQL se encuentra en ejecución.

Cada respaldo corresponde a un único estado consistente de la base de datos.

---

# Tipos de respaldo

El sistema contempla los siguientes tipos de respaldo:

| Tipo | Propósito |
|------|-----------|
| `manual` | Respaldo iniciado manualmente por un administrador. |
| `daily` | Respaldo periódico diario. |
| `weekly` | Respaldo periódico semanal. |
| `pre-update` | Respaldo obligatorio antes de una actualización. |
| `pre-restore` | Respaldo automático antes de restaurar otro respaldo. |

Todos los respaldos siguen exactamente el mismo proceso de validación.

---

# Flujo de creación

```text id="k4d1ws"
Validación del entorno
        │
        ▼
Verificación de PostgreSQL
        │
        ▼
pg_dump
        │
        ▼
Validación mediante pg_restore
        │
        ▼
metadata.txt
        │
        ▼
SHA256SUMS
        │
        ▼
Publicación del respaldo
```

Si cualquiera de estas etapas falla, el respaldo se descarta automáticamente y nunca se publica como un respaldo válido.

---

# Contenido del respaldo

Cada respaldo contiene, como mínimo:

```text id="y5ghbp"
database.dump
metadata.txt
SHA256SUMS
```

---

## database.dump

Respaldo lógico generado mediante `pg_dump` en formato personalizado (`custom`).

---

## metadata.txt

Incluye información técnica del respaldo:

- nombre del respaldo;
- tipo;
- fecha y hora UTC;
- versión de la aplicación;
- nombre de la base de datos;
- usuario de PostgreSQL;
- versión del servidor PostgreSQL;
- tamaño del respaldo;
- checksum SHA-256;
- resultado de la validación.

---

## SHA256SUMS

Contiene los checksums SHA-256 de todos los archivos generados para permitir verificar la integridad del respaldo.

---

# Validación

Antes de considerar un respaldo como válido se realizan las siguientes comprobaciones:

- PostgreSQL debe encontrarse saludable.
- El archivo generado no puede estar vacío.
- `pg_restore` debe reconocer correctamente el respaldo.
- Deben generarse correctamente los metadatos.
- Deben generarse correctamente los checksums.

Si cualquiera de estas comprobaciones falla, el respaldo completo es descartado.

---

# Restauración

Toda restauración sigue un procedimiento controlado.

```text id="4vp6m2"
Verificación del respaldo
        │
        ▼
Validación de compatibilidad
        │
        ▼
Backup preventivo
        │
        ▼
Confirmación explícita
        │
        ▼
Detención de la aplicación
        │
        ▼
Recreación de la base
        │
        ▼
pg_restore
        │
        ▼
Validación de tablas
        │
        ▼
Inicio del sistema
        │
        ▼
Healthcheck
```

---

# Medidas de seguridad

Durante la restauración el sistema:

- verifica la integridad del respaldo;
- valida que el respaldo pertenezca a la base configurada;
- valida la versión de la aplicación;
- crea automáticamente un respaldo preventivo (`pre-restore`);
- solicita una confirmación explícita antes de modificar la base de datos;
- detiene únicamente los servicios necesarios;
- valida la restauración antes de volver a poner el sistema en operación.

---

# Política de retención

La política de retención dependerá de las necesidades de cada instalación.

Como punto de partida se recomienda:

- siete respaldos diarios;
- cuatro respaldos semanales;
- respaldo obligatorio antes de cada actualización;
- respaldo obligatorio antes de cada restauración;
- copia periódica en un dispositivo externo.

---

# Recomendaciones operativas

Se recomienda:

- verificar periódicamente la creación correcta de respaldos;
- probar restauraciones de forma programada;
- almacenar una copia externa de los respaldos críticos;
- proteger los directorios de respaldo mediante permisos adecuados;
- documentar cada restauración realizada.

---

# Regla fundamental

Un respaldo no debe considerarse válido únicamente porque fue creado correctamente.

Un respaldo solo puede considerarse confiable cuando ha sido restaurado y validado satisfactoriamente mediante un procedimiento de prueba controlado.