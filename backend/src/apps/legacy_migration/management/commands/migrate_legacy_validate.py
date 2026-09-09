from django.core.management.base import BaseCommand, CommandError

from apps.legacy_migration.location import resolve_locations
from apps.legacy_migration.models import (
    MigrationIssue,
    MigrationIssueCategory,
    MigrationIssueSeverity,
    MigrationRun,
    SourceTable,
)

# Umbral acordado con Alejandro: el bug de año de 2 dígitos del sistema
# legacy siempre produce años < 1950 (nunca escribió un año real de
# 1900-1949), así que corregir sumando 100 es seguro.
BUGGY_YEAR_THRESHOLD = 1950


class Command(BaseCommand):
    help = (
        "Valida el staging de una MigrationRun (huérfanos, fechas, "
        "ubicaciones, montos) y registra MigrationIssue. No modifica "
        "ni crea ningún registro de negocio."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--run",
            type=int,
            help="ID de la MigrationRun a validar (default: la última).",
        )

    def handle(self, *args, **options):
        run = self._get_run(options.get("run"))

        proveedores = {
            r.source_key: r.raw_data
            for r in run.staging_records.filter(source_table=SourceTable.INVEN01)
        }
        piezas = {
            r.source_key: r.raw_data
            for r in run.staging_records.filter(source_table=SourceTable.INVEN03)
        }
        stock = {
            r.source_key: r.raw_data
            for r in run.staging_records.filter(source_table=SourceTable.INVEN08)
        }
        compras = list(run.staging_records.filter(source_table=SourceTable.INVEN05))

        issues: list[MigrationIssue] = []
        fechas_corregidas = 0

        issues += self._check_locations(run, piezas)
        issues += self._check_stock_orphans(run, piezas, stock)
        issues += self._check_stock_mismatch(run, piezas, stock)

        compra_issues, fechas_corregidas = self._check_compras(run, proveedores, piezas, compras)
        issues += compra_issues

        MigrationIssue.objects.bulk_create(issues, batch_size=1000)

        run.summary = {
            **run.summary,
            "validacion": {
                "issues_generados": len(issues),
                "fechas_corregidas_por_bug_de_anio": fechas_corregidas,
            },
        }
        run.save(update_fields=["summary"])

        self.stdout.write(
            self.style.SUCCESS(
                f"Validación de MigrationRun #{run.pk}: {len(issues)} MigrationIssue nuevos "
                f"({fechas_corregidas} fechas con año corregible, contadas pero NO logueadas "
                "una por una — ver razón en el resumen)."
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
            raise CommandError("No hay ninguna MigrationRun. Corré primero migrate_legacy_extract.")
        return run

    def _check_locations(self, run, piezas):
        names_by_key = {key: row["NOMPIE_03"] for key, row in piezas.items()}
        resolutions = resolve_locations(names_by_key)

        issues = []
        for key, resolution in resolutions.items():
            if resolution.location_code is not None:
                continue
            if resolution.low_confidence_token:
                issues.append(
                    MigrationIssue(
                        run=run,
                        severity=MigrationIssueSeverity.WARNING,
                        category=MigrationIssueCategory.UBICACION_NO_CONFIRMADA,
                        source_table=SourceTable.INVEN03,
                        source_key=key,
                        message=(
                            f"El nombre termina en '{resolution.low_confidence_token}', "
                            "pero ese código aparece una sola vez en todo el catálogo "
                            "— no se toma como ubicación confiable. Se asignará a SINUB."
                        ),
                        context={"nombre_original": names_by_key[key]},
                    )
                )
            else:
                issues.append(
                    MigrationIssue(
                        run=run,
                        severity=MigrationIssueSeverity.INFO,
                        category=MigrationIssueCategory.UBICACION_NO_DETECTADA,
                        source_table=SourceTable.INVEN03,
                        source_key=key,
                        message="No se detectó código de ubicación al final del nombre. Se asignará a SINUB.",
                        context={"nombre_original": names_by_key[key]},
                    )
                )
        return issues

    def _check_stock_orphans(self, run, piezas, stock):
        issues = []
        for key, row in stock.items():
            if key in piezas:
                continue
            issues.append(
                MigrationIssue(
                    run=run,
                    severity=MigrationIssueSeverity.WARNING,
                    category=MigrationIssueCategory.PRODUCTO_HUERFANO,
                    source_table=SourceTable.INVEN08,
                    source_key=key,
                    message=(
                        f"El código {key} tiene {row['STOCK_08']} unidades de stock "
                        "registradas, pero no existe en el catálogo de piezas (INVEN03). "
                        "No se crea un producto fantasma — queda documentado para revisión manual."
                    ),
                    context={"stock_08": row["STOCK_08"]},
                )
            )
        return issues

    def _check_stock_mismatch(self, run, piezas, stock):
        issues = []
        for key, pieza in piezas.items():
            stock_row = stock.get(key)
            if stock_row is None or pieza["STOCK_03"] == stock_row["STOCK_08"]:
                continue
            issues.append(
                MigrationIssue(
                    run=run,
                    severity=MigrationIssueSeverity.INFO,
                    category=MigrationIssueCategory.STOCK_DIFERENTE,
                    source_table=SourceTable.INVEN03,
                    source_key=key,
                    message=(
                        f"STOCK_03={pieza['STOCK_03']} pero STOCK_08={stock_row['STOCK_08']}. "
                        "Se usará STOCK_08 (fuente de conciliación) como valor real."
                    ),
                    context={"stock_03": pieza["STOCK_03"], "stock_08": stock_row["STOCK_08"]},
                )
            )
        return issues

    def _check_compras(self, run, proveedores, piezas, compras):
        issues = []
        fechas_corregidas = 0

        for staging_record in compras:
            row = staging_record.raw_data
            key = staging_record.source_key

            if str(row["CODPRO_05"]) not in proveedores:
                issues.append(
                    MigrationIssue(
                        run=run,
                        severity=MigrationIssueSeverity.WARNING,
                        category=MigrationIssueCategory.PROVEEDOR_FALTANTE,
                        source_table=SourceTable.INVEN05,
                        source_key=key,
                        message=(
                            f"Referencia el proveedor {row['CODPRO_05']}, que no existe "
                            "en el catálogo de proveedores. Esta línea no se importará."
                        ),
                        context={"codigo_proveedor": row["CODPRO_05"]},
                    )
                )

            if row["CODPIE_05"].strip() not in piezas:
                issues.append(
                    MigrationIssue(
                        run=run,
                        severity=MigrationIssueSeverity.WARNING,
                        category=MigrationIssueCategory.PRODUCTO_HUERFANO,
                        source_table=SourceTable.INVEN05,
                        source_key=key,
                        message=(
                            f"Referencia la pieza {row['CODPIE_05']}, que no existe en "
                            "el catálogo. Esta línea no se importará."
                        ),
                        context={"codigo_pieza": row["CODPIE_05"]},
                    )
                )

            if row.get("CANFAC_05") is None or row["CANFAC_05"] <= 0:
                issues.append(
                    MigrationIssue(
                        run=run,
                        severity=MigrationIssueSeverity.WARNING,
                        category=MigrationIssueCategory.MONTO_INVALIDO,
                        source_table=SourceTable.INVEN05,
                        source_key=key,
                        message=f"Cantidad inválida ({row.get('CANFAC_05')}). Esta línea no se importará.",
                        context={"cantidad": row.get("CANFAC_05")},
                    )
                )

            if (row.get("PRECOL_05") or 0) < 0:
                issues.append(
                    MigrationIssue(
                        run=run,
                        severity=MigrationIssueSeverity.WARNING,
                        category=MigrationIssueCategory.MONTO_INVALIDO,
                        source_table=SourceTable.INVEN05,
                        source_key=key,
                        message=f"Costo en colones negativo ({row['PRECOL_05']}).",
                        context={"precol_05": row["PRECOL_05"]},
                    )
                )

            fecha = row.get("FECFAC_05")
            if not fecha:
                issues.append(
                    MigrationIssue(
                        run=run,
                        severity=MigrationIssueSeverity.WARNING,
                        category=MigrationIssueCategory.FECHA_INVALIDA,
                        source_table=SourceTable.INVEN05,
                        source_key=key,
                        message="Fecha de factura vacía.",
                        context={},
                    )
                )
            elif int(fecha[:4]) < BUGGY_YEAR_THRESHOLD:
                # No se loguea un MigrationIssue por cada una a propósito:
                # son ~10.000 filas y todas comparten la misma causa
                # mecánica (bug de año de 2 dígitos). Se cuentan acá y se
                # corrigen de verdad en la normalización/importación.
                fechas_corregidas += 1

        return issues, fechas_corregidas
