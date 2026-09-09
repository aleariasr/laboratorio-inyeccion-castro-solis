from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.legacy_migration.dbf import read_dbf
from apps.legacy_migration.models import (
    LegacyStagingRecord,
    MigrationIssue,
    MigrationIssueCategory,
    MigrationIssueSeverity,
    MigrationRun,
    MigrationRunStatus,
    SourceTable,
)
from apps.legacy_migration.utils import json_safe

# Un solo INVEN06 (salidas/ventas) queda fuera: se investigó fuera de
# este comando y está mayormente corrupto en su origen (no es un
# problema de esta copia en particular), no es reconstruible.
ENTITIES = {
    SourceTable.INVEN01: {
        "filename": "INVEN01.DBF",
        "key_fn": lambda r: str(r["CODPRO_01"]),
    },
    SourceTable.INVEN03: {
        "filename": "INVEN03.DBF",
        "key_fn": lambda r: r["CODPIE_03"].strip(),
    },
    SourceTable.INVEN05: {
        "filename": "INVEN05.DBF",
        "key_fn": lambda r: f"{r['NUMFAC_05']}:{r['CODPRO_05']}:{r['NUMITE_05']}",
    },
    SourceTable.INVEN08: {
        "filename": "INVEN08.DBF",
        "key_fn": lambda r: r["CODPIE_08"].strip(),
    },
}


class Command(BaseCommand):
    help = (
        "Extrae INVEN01/03/05/08 (proveedores, piezas, compras, stock) de "
        "los .DBF legacy hacia LegacyStagingRecord, fusionando la copia "
        "'bases1' (principal) con la copia 'raiz' (solo rellena códigos "
        "que falten en bases1). INVEN06 (ventas) queda fuera a propósito: "
        "se verificó que está mayormente corrupto y no es reconstruible."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--bases1",
            required=True,
            help="Carpeta con los .DBF de la copia 'bases1' (fuente principal).",
        )
        parser.add_argument(
            "--root",
            required=True,
            help="Carpeta con los .DBF de la copia 'raiz' (solo rellena huecos).",
        )

    def handle(self, *args, **options):
        bases1_dir = Path(options["bases1"])
        root_dir = Path(options["root"])

        for base_dir in (bases1_dir, root_dir):
            if not base_dir.is_dir():
                raise CommandError(f"No existe la carpeta: {base_dir}")

        run = MigrationRun.objects.create(
            status=MigrationRunStatus.RUNNING,
            started_at=timezone.now(),
        )

        summary = {}
        try:
            with transaction.atomic():
                for source_table, spec in ENTITIES.items():
                    counts = self._extract_entity(
                        run=run,
                        source_table=source_table,
                        filename=spec["filename"],
                        key_fn=spec["key_fn"],
                        bases1_dir=bases1_dir,
                        root_dir=root_dir,
                    )
                    summary[source_table] = counts
                    self.stdout.write(
                        f"{source_table}: {counts['staged']} registros en staging "
                        f"({counts['from_bases1']} de bases1, {counts['from_root']} solo de raíz) — "
                        f"{counts['conflicts']} conflictos, {counts['duplicates']} duplicados descartados"
                    )
            run.status = MigrationRunStatus.COMPLETED
        except Exception:
            run.status = MigrationRunStatus.FAILED
            raise
        finally:
            run.finished_at = timezone.now()
            run.summary = summary
            run.save(update_fields=["status", "finished_at", "summary"])

        self.stdout.write(self.style.SUCCESS(f"MigrationRun #{run.pk}: {run.status}"))

    def _extract_entity(self, *, run, source_table, filename, key_fn, bases1_dir, root_dir):
        bases1_result = read_dbf(bases1_dir / filename)
        root_result = read_dbf(root_dir / filename)

        bases1_by_key = self._index_and_dedupe(
            run, source_table, "bases1", bases1_result.active, key_fn
        )
        root_by_key = self._index_and_dedupe(
            run, source_table, "raiz", root_result.active, key_fn
        )

        duplicates = (
            len(bases1_result.active) - len(bases1_by_key)
            + len(root_result.active) - len(root_by_key)
        )

        merged: dict[str, tuple[dict, str]] = {}
        for key, row in root_by_key.items():
            merged[key] = (row, "raiz")

        conflicts = 0
        for key, row in bases1_by_key.items():
            if key in merged and merged[key][0] != row:
                conflicts += 1
                MigrationIssue.objects.create(
                    run=run,
                    severity=MigrationIssueSeverity.INFO,
                    category=MigrationIssueCategory.CONFLICTO_ENTRE_COPIAS,
                    source_table=source_table,
                    source_key=key,
                    message=(
                        f"El código {key} tiene datos distintos en bases1 y en la "
                        "raíz. Se usó la versión de bases1 (fuente principal)."
                    ),
                    context={
                        "bases1": json_safe(row),
                        "raiz": json_safe(merged[key][0]),
                    },
                )
            merged[key] = (row, "bases1")

        staging_records = [
            LegacyStagingRecord(
                run=run,
                source_table=source_table,
                source_origin=origin,
                source_key=key,
                raw_data=json_safe(row),
            )
            for key, (row, origin) in merged.items()
        ]
        LegacyStagingRecord.objects.bulk_create(staging_records, batch_size=1000)

        return {
            "staged": len(merged),
            "from_bases1": sum(1 for _, origin in merged.values() if origin == "bases1"),
            "from_root": sum(1 for _, origin in merged.values() if origin == "raiz"),
            "conflicts": conflicts,
            "duplicates": duplicates,
        }

    def _index_and_dedupe(self, run, source_table, origin, rows, key_fn):
        """
        Indexa las filas de UNA sola copia por su clave natural. Si la
        misma clave aparece más de una vez dentro de la MISMA copia, se
        queda con la primera ocurrencia y registra un MigrationIssue por
        cada duplicado descartado.
        """
        by_key: dict[str, dict] = {}
        for row in rows:
            try:
                key = key_fn(row)
            except (KeyError, TypeError):
                MigrationIssue.objects.create(
                    run=run,
                    severity=MigrationIssueSeverity.WARNING,
                    category=MigrationIssueCategory.RELACION_INCOMPLETA,
                    source_table=source_table,
                    source_key="",
                    message=f"Fila de {origin} sin clave natural completa, descartada.",
                    context={"row": json_safe(row)},
                )
                continue

            if key in by_key:
                MigrationIssue.objects.create(
                    run=run,
                    severity=MigrationIssueSeverity.WARNING,
                    category=MigrationIssueCategory.CODIGO_DUPLICADO,
                    source_table=source_table,
                    source_key=key,
                    message=(
                        f"Código {key} duplicado dentro de la copia '{origin}'. "
                        "Se usó la primera ocurrencia, se descartó el resto."
                    ),
                    context={"row_descartada": json_safe(row)},
                )
                continue

            by_key[key] = row
        return by_key
