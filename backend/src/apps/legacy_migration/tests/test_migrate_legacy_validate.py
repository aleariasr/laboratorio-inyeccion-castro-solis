from django.core.management import call_command
from django.test import TestCase

from apps.legacy_migration.models import (
    LegacyStagingRecord,
    MigrationIssueCategory,
    MigrationRun,
    SourceTable,
)


class MigrateLegacyValidateTests(TestCase):
    def setUp(self):
        self.run = MigrationRun.objects.create()

        LegacyStagingRecord.objects.create(
            run=self.run,
            source_table=SourceTable.INVEN01,
            source_origin="bases1",
            source_key="2",
            raw_data={"CODPRO_01": 2, "NOMPRO_01": "MADISA"},
        )
        LegacyStagingRecord.objects.create(
            run=self.run,
            source_table=SourceTable.INVEN03,
            source_origin="bases1",
            source_key="7135-74",
            raw_data={
                "CODPIE_03": "7135-74",
                "NOMPIE_03": "CAMISA VALVULA TRASIEGO PERKINS 354 B147",
                "STOCK_03": 8,
                "PREVEN_03": 4000.0,
                "CANMIN_03": 2,
            },
        )
        LegacyStagingRecord.objects.create(
            run=self.run,
            source_table=SourceTable.INVEN08,
            source_origin="bases1",
            source_key="7135-74",
            raw_data={"CODPIE_08": "7135-74", "STOCK_08": 5},  # distinto a STOCK_03 (8) a propósito
        )
        LegacyStagingRecord.objects.create(
            run=self.run,
            source_table=SourceTable.INVEN08,
            source_origin="bases1",
            source_key="CODIGO-HUERFANO",
            raw_data={"CODPIE_08": "CODIGO-HUERFANO", "STOCK_08": 3},
        )

    def test_flags_stock_mismatch_between_inven03_and_inven08(self):
        call_command("migrate_legacy_validate", run=self.run.pk)

        issue = self.run.issues.get(category=MigrationIssueCategory.STOCK_DIFERENTE)
        self.assertEqual(issue.source_key, "7135-74")
        self.assertEqual(issue.context["stock_03"], 8)
        self.assertEqual(issue.context["stock_08"], 5)

    def test_flags_orphan_stock_code_not_in_catalog(self):
        call_command("migrate_legacy_validate", run=self.run.pk)

        issue = self.run.issues.get(
            category=MigrationIssueCategory.PRODUCTO_HUERFANO,
            source_key="CODIGO-HUERFANO",
        )
        self.assertEqual(issue.source_table, SourceTable.INVEN08)

    def test_purchase_referencing_unknown_supplier_and_piece_is_flagged(self):
        LegacyStagingRecord.objects.create(
            run=self.run,
            source_table=SourceTable.INVEN05,
            source_origin="bases1",
            source_key="100:99:1",
            raw_data={
                "NUMFAC_05": 100,
                "CODPRO_05": 99,  # no existe en proveedores
                "FECFAC_05": "1904-05-12",  # bug de año: debería ser 2004
                "NUMITE_05": 1,
                "CODPIE_05": "NO-EXISTE",  # no existe en piezas
                "CANFAC_05": 5,
                "PRECOL_05": 100.0,
                "PREDOL_05": 1.0,
            },
        )

        call_command("migrate_legacy_validate", run=self.run.pk)
        self.run.refresh_from_db()

        self.assertTrue(
            self.run.issues.filter(category=MigrationIssueCategory.PROVEEDOR_FALTANTE).exists()
        )
        self.assertTrue(
            self.run.issues.filter(
                category=MigrationIssueCategory.PRODUCTO_HUERFANO,
                source_table=SourceTable.INVEN05,
            ).exists()
        )
        # el bug de año NO se loguea fila por fila, solo se cuenta:
        self.assertEqual(self.run.summary["validacion"]["fechas_corregidas_por_bug_de_anio"], 1)

    def test_low_confidence_short_location_token_defaults_to_no_location(self):
        LegacyStagingRecord.objects.create(
            run=self.run,
            source_table=SourceTable.INVEN03,
            source_origin="bases1",
            source_key="OTRA-PIEZA",
            raw_data={
                "CODPIE_03": "OTRA-PIEZA",
                "NOMPIE_03": "ARANDELA SHIM DIAFRAGMA E1",  # E1 aparece una sola vez
                "STOCK_03": 1,
                "PREVEN_03": 100.0,
                "CANMIN_03": 0,
            },
        )

        call_command("migrate_legacy_validate", run=self.run.pk)

        issue = self.run.issues.get(
            category=MigrationIssueCategory.UBICACION_NO_CONFIRMADA,
            source_key="OTRA-PIEZA",
        )
        self.assertIn("E1", issue.message)
