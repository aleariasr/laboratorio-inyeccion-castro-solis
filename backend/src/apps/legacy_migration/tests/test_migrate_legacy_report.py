from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.legacy_migration.models import LegacyStagingRecord, MigrationRun, SourceTable


def _stage(run, table, origin, key, data):
    return LegacyStagingRecord.objects.create(
        run=run, source_table=table, source_origin=origin, source_key=key, raw_data=data
    )


class MigrateLegacyReportTests(TestCase):
    def test_report_counts_reflect_cumulative_state_across_multiple_import_runs(self):
        run = MigrationRun.objects.create()

        _stage(run, SourceTable.INVEN01, "bases1", "2", {"CODPRO_01": 2, "NOMPRO_01": "MADISA"})
        _stage(
            run,
            SourceTable.INVEN03,
            "bases1",
            "7135-74",
            {
                "CODPIE_03": "7135-74",
                "NOMPIE_03": "CAMISA VALVULA TRASIEGO PERKINS 354 B147",
                "STOCK_03": 8,
                "PREVEN_03": 4000.0,
                "CANMIN_03": 2,
            },
        )
        _stage(run, SourceTable.INVEN08, "bases1", "7135-74", {"CODPIE_08": "7135-74", "STOCK_08": 8})
        _stage(
            run,
            SourceTable.INVEN05,
            "bases1",
            "500:2:1",
            {
                "NUMFAC_05": 500, "CODPRO_05": 2, "FECFAC_05": "1995-01-01", "NUMITE_05": 1,
                "CODPIE_05": "7135-74", "CANFAC_05": 5, "PRECOL_05": 100.0, "PREDOL_05": 0.2,
            },
        )

        call_command("migrate_legacy_validate", run=run.pk)
        # simula el escenario real: la importación se corre dos veces
        # (ej. tras un crash a mitad de camino en la primera).
        call_command("migrate_legacy_import", run=run.pk)
        call_command("migrate_legacy_import", run=run.pk)

        out = StringIO()
        call_command("migrate_legacy_report", run=run.pk, stdout=out)
        output = out.getvalue()

        self.assertIn("proveedores", output)
        self.assertIn("importados: 1", output)
        self.assertIn("compras_importadas: 1", output)
        self.assertIn("lineas_importadas: 1", output)
        self.assertIn("errores_bloqueantes:\n  0", output)
