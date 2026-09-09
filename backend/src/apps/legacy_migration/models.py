from django.db import models

from apps.core.models import AuditModel, TimeStampedModel


class SourceTable(models.TextChoices):
    """
    Las 4 fuentes DBF que sí se migran. INVEN06 (salidas/ventas)
    quedó fuera del alcance: se verificó que está mayormente
    corrupto (ver MigrationIssue de categoría DATO_ILEGIBLE
    documentadas fuera de esta app, en la investigación previa a
    la migración) y no es reconstruible de forma confiable.
    """

    INVEN01 = "INVEN01", "Proveedores"
    INVEN03 = "INVEN03", "Piezas / productos"
    INVEN05 = "INVEN05", "Compras / facturas"
    INVEN08 = "INVEN08", "Stock auxiliar"


class MigrationRunStatus(models.TextChoices):
    PENDING = "PENDING", "Pendiente"
    RUNNING = "RUNNING", "En ejecución"
    COMPLETED = "COMPLETED", "Completada"
    FAILED = "FAILED", "Fallida"


class MigrationIssueSeverity(models.TextChoices):
    BLOCKING = "BLOCKING", "Bloqueante"
    WARNING = "WARNING", "Advertencia"
    INFO = "INFO", "Informativa"


class MigrationIssueCategory(models.TextChoices):
    PRODUCTO_HUERFANO = "PRODUCTO_HUERFANO", "Producto referenciado que no existe en catálogo"
    PROVEEDOR_FALTANTE = "PROVEEDOR_FALTANTE", "Proveedor referenciado que no existe"
    STOCK_DIFERENTE = "STOCK_DIFERENTE", "Stock distinto entre INVEN03 e INVEN08"
    FECHA_CORREGIDA = "FECHA_CORREGIDA", "Fecha corregida por bug de año de 2 dígitos"
    FECHA_INVALIDA = "FECHA_INVALIDA", "Fecha inválida o fuera de rango"
    MONTO_INVALIDO = "MONTO_INVALIDO", "Monto o moneda ambigua"
    CODIGO_DUPLICADO = "CODIGO_DUPLICADO", "Código duplicado"
    DATO_ILEGIBLE = "DATO_ILEGIBLE", "Dato ilegible por codificación o corrupción"
    RELACION_INCOMPLETA = "RELACION_INCOMPLETA", "Relación incompleta"
    UBICACION_NO_CONFIRMADA = "UBICACION_NO_CONFIRMADA", "Ubicación de baja confianza, asignada a SINUB"
    UBICACION_NO_DETECTADA = "UBICACION_NO_DETECTADA", "Sin ubicación detectable en el nombre, asignada a SINUB"
    CONFLICTO_ENTRE_COPIAS = "CONFLICTO_ENTRE_COPIAS", "Mismo código con datos distintos entre bases1 y raíz"
    AJUSTE_CONCILIACION = "AJUSTE_CONCILIACION", "Ajuste de stock por conciliación final contra INVEN08"
    OTRO = "OTRO", "Otro"


class MigrationRun(AuditModel):
    """
    Una ejecución del pipeline de migración legacy DBF (extracción ->
    staging -> validación -> normalización -> importación ->
    conciliación). created_by/created_at (de AuditModel) registran
    quién y cuándo se disparó.
    """

    status = models.CharField(
        max_length=15,
        choices=MigrationRunStatus.choices,
        default=MigrationRunStatus.PENDING,
    )

    started_at = models.DateTimeField(null=True, blank=True)

    finished_at = models.DateTimeField(null=True, blank=True)

    summary = models.JSONField(
        default=dict,
        blank=True,
        help_text="Totales detectados/importados por entidad, para el reporte final.",
    )

    notes = models.TextField(blank=True)

    class Meta:
        db_table = "legacy_migration_runs"
        verbose_name = "Ejecución de migración"
        verbose_name_plural = "Ejecuciones de migración"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Migración #{self.pk} ({self.get_status_display()})"


class LegacyStagingRecord(TimeStampedModel):
    """
    Fila cruda extraída de un DBF, sin interpretar/normalizar
    todavía. source_key es la clave natural del registro en su
    tabla de origen (ej. CODPRO_01, CODPIE_03, o un compuesto
    "NUMFAC_05:CODPRO_05:NUMITE_05" para líneas de compra).
    """

    run = models.ForeignKey(
        MigrationRun,
        on_delete=models.CASCADE,
        related_name="staging_records",
    )

    source_table = models.CharField(
        max_length=10,
        choices=SourceTable.choices,
    )

    source_origin = models.CharField(
        max_length=20,
        help_text='De qué copia física vino: "bases1" o "raiz".',
    )

    source_key = models.CharField(
        max_length=100,
        db_index=True,
    )

    raw_data = models.JSONField(
        help_text="Fila cruda tal como vino del DBF (fechas como texto ISO).",
    )

    class Meta:
        db_table = "legacy_migration_staging_records"
        verbose_name = "Registro en staging"
        verbose_name_plural = "Registros en staging"
        indexes = [
            models.Index(
                fields=["source_table", "source_key"],
                name="legacy_staging_source_idx",
            ),
        ]
        ordering = ["source_table", "source_key"]

    def __str__(self):
        return f"{self.source_table}:{self.source_key}"


class MigrationIssue(TimeStampedModel):
    """
    Inconsistencia detectada durante la migración. La migración solo
    se considera aceptable cuando las de severidad BLOCKING están
    resueltas o formalmente documentadas — no se ignoran.
    """

    run = models.ForeignKey(
        MigrationRun,
        on_delete=models.CASCADE,
        related_name="issues",
    )

    severity = models.CharField(
        max_length=10,
        choices=MigrationIssueSeverity.choices,
    )

    category = models.CharField(
        max_length=30,
        choices=MigrationIssueCategory.choices,
    )

    source_table = models.CharField(
        max_length=10,
        choices=SourceTable.choices,
        blank=True,
    )

    source_key = models.CharField(
        max_length=100,
        blank=True,
    )

    message = models.TextField()

    context = models.JSONField(
        default=dict,
        blank=True,
        help_text="Datos estructurados adicionales (valores comparados, etc.).",
    )

    class Meta:
        db_table = "legacy_migration_issues"
        verbose_name = "Inconsistencia de migración"
        verbose_name_plural = "Inconsistencias de migración"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.severity}] {self.category} — {self.source_key}"


class LegacyRecordMap(TimeStampedModel):
    """
    Traza cada registro legacy hacia el registro que generó en el
    modelo nuevo, sin contaminar ese modelo con campos legacy.
    target_model se guarda como texto (ej. "inventory.Supplier") en
    vez de un GenericForeignKey, porque acá lo único que hace falta
    es trazabilidad de auditoría, no una relación de Django navegable.

    Única por (source_table, source_key, target_model) y no por
    ejecución: así, si el comando de importación se vuelve a correr,
    puede detectar qué ya se importó y no duplicarlo.
    """

    run = models.ForeignKey(
        MigrationRun,
        on_delete=models.CASCADE,
        related_name="record_maps",
    )

    source_table = models.CharField(
        max_length=10,
        choices=SourceTable.choices,
    )

    source_key = models.CharField(
        max_length=100,
    )

    target_model = models.CharField(
        max_length=100,
        help_text='Ej. "inventory.Supplier", "inventory.Product".',
    )

    target_id = models.PositiveIntegerField()

    class Meta:
        db_table = "legacy_migration_record_maps"
        verbose_name = "Mapa de registro legacy"
        verbose_name_plural = "Mapas de registros legacy"
        constraints = [
            models.UniqueConstraint(
                fields=["source_table", "source_key", "target_model"],
                name="uq_legacy_record_map_source",
            ),
        ]
        indexes = [
            models.Index(
                fields=["target_model", "target_id"],
                name="legacy_record_map_target_idx",
            ),
        ]
        ordering = ["source_table", "source_key"]

    def __str__(self):
        return f"{self.source_table}:{self.source_key} -> {self.target_model}#{self.target_id}"
