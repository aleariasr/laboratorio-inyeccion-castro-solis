from django.core.management.base import BaseCommand, CommandError

from apps.legacy_migration.models import (
    LegacyRecordMap,
    MigrationIssueCategory,
    MigrationIssueSeverity,
    MigrationRun,
    SourceTable,
)

# Cuenta lo que hay REALMENTE en la base para esta MigrationRun,
# consultando LegacyRecordMap y MigrationIssue directamente — no los
# contadores por-invocación de cada comando, que solo reflejan lo que
# hizo esa corrida puntual y subestiman el total si el comando se
# corrió varias veces (por ejemplo, después de un crash a mitad de
# camino).


class Command(BaseCommand):
    help = "Genera el reporte final de una MigrationRun: totales reales, huérfanos, diferencias, errores."

    def add_arguments(self, parser):
        parser.add_argument("--run", type=int, help="ID de la MigrationRun (default: la última).")

    def handle(self, *args, **options):
        run = self._get_run(options.get("run"))

        staged_counts = {
            table: run.staging_records.filter(source_table=table).count()
            for table in SourceTable.values
        }

        imported_counts = {
            model: LegacyRecordMap.objects.filter(run=run, target_model=model).count()
            for model in (
                "inventory.Supplier",
                "inventory.Product",
                "inventory.Purchase",
                "inventory.PurchaseItem",
            )
        }

        orphan_products_compras = run.issues.filter(
            source_table=SourceTable.INVEN05,
            category=MigrationIssueCategory.PRODUCTO_HUERFANO,
        ).count()
        orphan_products_stock = run.issues.filter(
            source_table=SourceTable.INVEN08,
            category=MigrationIssueCategory.PRODUCTO_HUERFANO,
        ).count()
        missing_suppliers = run.issues.filter(
            category=MigrationIssueCategory.PROVEEDOR_FALTANTE
        ).count()
        stock_differences = run.issues.filter(
            category=MigrationIssueCategory.STOCK_DIFERENTE
        ).count()
        reconciliation_adjustments = run.issues.filter(
            category=MigrationIssueCategory.AJUSTE_CONCILIACION
        ).count()
        discarded_zero_cost = run.issues.filter(
            category=MigrationIssueCategory.MONTO_INVALIDO,
            source_table=SourceTable.INVEN05,
        ).count()
        discarded_invalid_date = run.issues.filter(
            category=MigrationIssueCategory.FECHA_INVALIDA,
            source_table=SourceTable.INVEN05,
        ).count()
        merged_duplicate_lines = run.issues.filter(
            category=MigrationIssueCategory.CODIGO_DUPLICADO,
            source_table=SourceTable.INVEN05,
        ).count()
        low_confidence_locations = run.issues.filter(
            category=MigrationIssueCategory.UBICACION_NO_CONFIRMADA
        ).count()
        no_location = run.issues.filter(
            category=MigrationIssueCategory.UBICACION_NO_DETECTADA
        ).count()

        blocking = run.issues.filter(severity=MigrationIssueSeverity.BLOCKING).count()
        warnings = run.issues.filter(severity=MigrationIssueSeverity.WARNING).count()
        info = run.issues.filter(severity=MigrationIssueSeverity.INFO).count()

        fechas_corregidas = run.summary.get("validacion", {}).get(
            "fechas_corregidas_por_bug_de_anio", "desconocido (correr migrate_legacy_validate)"
        )

        report = {
            "proveedores": {
                "detectados": staged_counts[SourceTable.INVEN01],
                "importados": imported_counts["inventory.Supplier"],
            },
            "productos": {
                "detectados": staged_counts[SourceTable.INVEN03],
                "importados": imported_counts["inventory.Product"],
                "sin_ubicacion_detectada": no_location,
                "ubicacion_de_baja_confianza": low_confidence_locations,
            },
            "compras": {
                "lineas_detectadas": staged_counts[SourceTable.INVEN05],
                "lineas_importadas": imported_counts["inventory.PurchaseItem"],
                "compras_importadas": imported_counts["inventory.Purchase"],
                "lineas_fusionadas_por_duplicado_en_misma_factura": merged_duplicate_lines,
                "lineas_descartadas_por_costo_cero": discarded_zero_cost,
                "lineas_descartadas_por_fecha_invalida": discarded_invalid_date,
            },
            "stock_auxiliar": {
                "filas_detectadas": staged_counts[SourceTable.INVEN08],
            },
            "productos_huerfanos": {
                "referenciados_en_compras": orphan_products_compras,
                "referenciados_en_stock_auxiliar": orphan_products_stock,
            },
            "proveedores_faltantes_en_compras": missing_suppliers,
            "diferencias_de_stock_catalogo_vs_auxiliar": stock_differences,
            "productos_ajustados_por_conciliacion_final": reconciliation_adjustments,
            "fechas_corregidas_por_bug_de_anio": fechas_corregidas,
            "errores_bloqueantes": blocking,
            "advertencias_no_bloqueantes": warnings,
            "notas_informativas": info,
        }

        self.stdout.write(self.style.SUCCESS(f"=== Reporte de MigrationRun #{run.pk} ==="))
        for section, data in report.items():
            self.stdout.write(f"\n{section}:")
            if isinstance(data, dict):
                for key, value in data.items():
                    self.stdout.write(f"  {key}: {value}")
            else:
                self.stdout.write(f"  {data}")

        if blocking:
            self.stdout.write(
                self.style.ERROR(
                    f"\nATENCIÓN: hay {blocking} errores BLOCKING sin resolver. "
                    "Revisar antes de dar la migración por buena."
                )
            )

    def _get_run(self, run_id):
        if run_id:
            try:
                return MigrationRun.objects.get(pk=run_id)
            except MigrationRun.DoesNotExist:
                raise CommandError(f"No existe MigrationRun #{run_id}")
        run = MigrationRun.objects.order_by("-created_at").first()
        if run is None:
            raise CommandError("No hay ninguna MigrationRun.")
        return run
