import datetime
from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase

from apps.inventory.models import (
    Product,
    Purchase,
    PurchaseStatus,
    StockMovement,
    StockMovementType,
    StorageLocation,
    Supplier,
)
from apps.inventory.selectors import current_stock
from apps.legacy_migration.models import (
    LegacyStagingRecord,
    MigrationIssueCategory,
    MigrationRun,
    SourceTable,
)


def _stage(run, table, origin, key, data):
    return LegacyStagingRecord.objects.create(
        run=run, source_table=table, source_origin=origin, source_key=key, raw_data=data
    )


class MigrateLegacyImportTests(TestCase):
    def setUp(self):
        self.run = MigrationRun.objects.create()

        _stage(self.run, SourceTable.INVEN01, "bases1", "2", {"CODPRO_01": 2, "NOMPRO_01": "MADISA"})

        _stage(
            self.run,
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
        _stage(
            self.run,
            SourceTable.INVEN03,
            "bases1",
            "SIN-UBICACION",
            {
                "CODPIE_03": "SIN-UBICACION",
                "NOMPIE_03": "CIGUEÑAL FORD 5000",
                "STOCK_03": 3,
                "PREVEN_03": 0.0,
                "CANMIN_03": 0,
            },
        )

        _stage(self.run, SourceTable.INVEN08, "bases1", "7135-74", {"CODPIE_08": "7135-74", "STOCK_08": 15})
        _stage(
            self.run,
            SourceTable.INVEN08,
            "bases1",
            "SIN-UBICACION",
            {"CODPIE_08": "SIN-UBICACION", "STOCK_08": 3},
        )

        _stage(
            self.run,
            SourceTable.INVEN05,
            "bases1",
            "500:2:1",
            {
                "NUMFAC_05": 500,
                "CODPRO_05": 2,
                "FECFAC_05": "1904-05-12",  # bug de año -> debería quedar 2004-05-12
                "NUMITE_05": 1,
                "CODPIE_05": "7135-74",
                "CANFAC_05": 5,
                "PRECOL_05": 1000.0,
                "PREDOL_05": 1.9,
            },
        )
        # línea huérfana: pieza que no existe -> la valida el paso de validación
        _stage(
            self.run,
            SourceTable.INVEN05,
            "bases1",
            "500:2:2",
            {
                "NUMFAC_05": 500,
                "CODPRO_05": 2,
                "FECFAC_05": "1904-05-12",
                "NUMITE_05": 2,
                "CODPIE_05": "NO-EXISTE",
                "CANFAC_05": 2,
                "PRECOL_05": 300.0,
                "PREDOL_05": 0.5,
            },
        )
        # línea con costo cero -> la descarta el propio import
        _stage(
            self.run,
            SourceTable.INVEN05,
            "bases1",
            "500:2:3",
            {
                "NUMFAC_05": 500,
                "CODPRO_05": 2,
                "FECFAC_05": "1904-05-12",
                "NUMITE_05": 3,
                "CODPIE_05": "7135-74",
                "CANFAC_05": 1,
                "PRECOL_05": 0.0,
                "PREDOL_05": 0.0,
            },
        )
        # factura entera de un proveedor que no existe
        _stage(
            self.run,
            SourceTable.INVEN05,
            "bases1",
            "999:9:1",
            {
                "NUMFAC_05": 999,
                "CODPRO_05": 9,
                "FECFAC_05": "1995-01-01",
                "NUMITE_05": 1,
                "CODPIE_05": "7135-74",
                "CANFAC_05": 1,
                "PRECOL_05": 500.0,
                "PREDOL_05": 1.0,
            },
        )

        call_command("migrate_legacy_validate", run=self.run.pk)

    def test_imports_supplier_and_products_with_and_without_location(self):
        call_command("migrate_legacy_import", run=self.run.pk)

        supplier = Supplier.objects.get(name="MADISA")
        self.assertIsNotNone(supplier)

        product = Product.objects.get(standard_code="7135-74")
        self.assertEqual(product.name, "CAMISA VALVULA TRASIEGO PERKINS 354")
        self.assertEqual(product.storage_location.code, "B147")
        self.assertEqual(product.custom_sale_price, Decimal("4000.0"))

        product_sin_ubicacion = Product.objects.get(standard_code="SIN-UBICACION")
        self.assertEqual(product_sin_ubicacion.storage_location.code, "SINUB")
        self.assertIsNone(product_sin_ubicacion.custom_sale_price)  # PREVEN_03 era 0

    def test_only_the_valid_purchase_line_is_imported_with_corrected_date(self):
        call_command("migrate_legacy_import", run=self.run.pk)

        purchase = Purchase.objects.get(supplier__name="MADISA", invoice_number="500")
        self.assertEqual(purchase.status, PurchaseStatus.CONFIRMED)
        self.assertEqual(purchase.purchase_date, datetime.date(2004, 5, 12))  # +100 años

        self.assertEqual(purchase.items.count(), 1)  # las otras 2 líneas se descartan
        item = purchase.items.first()
        self.assertEqual(item.quantity, 5)
        self.assertEqual(item.unit_cost, Decimal("1000.0"))

        # la factura del proveedor inexistente no se importa
        self.assertFalse(Purchase.objects.filter(invoice_number="999").exists())

    def test_stock_movements_and_final_reconciliation_match_inven08(self):
        call_command("migrate_legacy_import", run=self.run.pk)

        product = Product.objects.get(standard_code="7135-74")

        entry_movement = StockMovement.objects.get(
            product=product, movement_type=StockMovementType.ENTRY
        )
        self.assertEqual(entry_movement.quantity, 5)

        # 5 de la compra + ajuste de 10 para llegar a STOCK_08=15
        self.assertEqual(current_stock(product), 15)

        adjustment = StockMovement.objects.get(
            product=product, movement_type=StockMovementType.ADJUSTMENT
        )
        self.assertEqual(adjustment.quantity, 10)

        # el producto sin compras también queda conciliado (ajuste puro)
        product_sin_ubicacion = Product.objects.get(standard_code="SIN-UBICACION")
        self.assertEqual(current_stock(product_sin_ubicacion), 3)

    def test_issues_are_logged_for_every_discarded_line(self):
        call_command("migrate_legacy_import", run=self.run.pk)

        self.assertTrue(
            self.run.issues.filter(
                category=MigrationIssueCategory.MONTO_INVALIDO, source_key="500:2:3"
            ).exists()
        )
        self.assertTrue(
            self.run.issues.filter(category=MigrationIssueCategory.AJUSTE_CONCILIACION).exists()
        )

    def test_running_twice_does_not_duplicate_anything(self):
        call_command("migrate_legacy_import", run=self.run.pk)
        call_command("migrate_legacy_import", run=self.run.pk)

        self.assertEqual(Supplier.objects.filter(name="MADISA").count(), 1)
        self.assertEqual(Product.objects.filter(standard_code="7135-74").count(), 1)
        self.assertEqual(Purchase.objects.filter(invoice_number="500").count(), 1)
        self.assertEqual(
            StockMovement.objects.filter(
                product__standard_code="7135-74", movement_type=StockMovementType.ADJUSTMENT
            ).count(),
            1,
        )


class MigrateLegacyImportDuplicateLineInSameInvoiceTests(TestCase):
    """
    Regresión: en los datos reales, la misma pieza puede aparecer en dos
    NUMITE_05 distintos dentro de la misma factura (NUMFAC_05+CODPRO_05).
    El modelo real solo permite una línea por producto por compra
    (unique_together purchase+supplier_product) — esto crasheó el primer
    intento de importación real con un IntegrityError. Deben fusionarse
    en una sola línea, sumando cantidad y promediando el costo unitario
    ponderado por cantidad.
    """

    def setUp(self):
        self.run = MigrationRun.objects.create()

        _stage(self.run, SourceTable.INVEN01, "bases1", "2", {"CODPRO_01": 2, "NOMPRO_01": "MADISA"})
        _stage(
            self.run,
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
        _stage(self.run, SourceTable.INVEN08, "bases1", "7135-74", {"CODPIE_08": "7135-74", "STOCK_08": 20})

        # misma pieza, misma factura, dos líneas con costos distintos
        _stage(
            self.run,
            SourceTable.INVEN05,
            "bases1",
            "700:2:1",
            {
                "NUMFAC_05": 700, "CODPRO_05": 2, "FECFAC_05": "1995-01-01", "NUMITE_05": 1,
                "CODPIE_05": "7135-74", "CANFAC_05": 3, "PRECOL_05": 100.0, "PREDOL_05": 0.2,
            },
        )
        _stage(
            self.run,
            SourceTable.INVEN05,
            "bases1",
            "700:2:2",
            {
                "NUMFAC_05": 700, "CODPRO_05": 2, "FECFAC_05": "1995-01-01", "NUMITE_05": 2,
                "CODPIE_05": "7135-74", "CANFAC_05": 1, "PRECOL_05": 200.0, "PREDOL_05": 0.4,
            },
        )

        call_command("migrate_legacy_validate", run=self.run.pk)

    def test_duplicate_product_lines_in_same_invoice_are_merged_not_rejected(self):
        call_command("migrate_legacy_import", run=self.run.pk)

        purchase = Purchase.objects.get(invoice_number="700")
        self.assertEqual(purchase.items.count(), 1)

        item = purchase.items.first()
        self.assertEqual(item.quantity, 4)  # 3 + 1
        # (3*100 + 1*200) / 4 = 125
        self.assertEqual(item.unit_cost, Decimal("125.0000"))

        self.assertTrue(
            self.run.issues.filter(category=MigrationIssueCategory.CODIGO_DUPLICADO).exists()
        )


class MigrateLegacyImportBlankDateTests(TestCase):
    """
    Regresión: una línea de compra con FECFAC_05 vacío queda como
    `None` en el staging. La validación ya la marca como
    FECHA_INVALIDA, pero esa categoría faltaba en SKIP_CATEGORIES del
    comando de importación, así que la línea igual se intentaba
    importar y explotaba al parsear `None` como fecha.
    """

    def setUp(self):
        self.run = MigrationRun.objects.create()

        _stage(self.run, SourceTable.INVEN01, "bases1", "2", {"CODPRO_01": 2, "NOMPRO_01": "MADISA"})
        _stage(
            self.run,
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
        _stage(self.run, SourceTable.INVEN08, "bases1", "7135-74", {"CODPIE_08": "7135-74", "STOCK_08": 8})

        _stage(
            self.run,
            SourceTable.INVEN05,
            "bases1",
            "800:2:1",
            {
                "NUMFAC_05": 800, "CODPRO_05": 2, "FECFAC_05": None, "NUMITE_05": 1,
                "CODPIE_05": "7135-74", "CANFAC_05": 2, "PRECOL_05": 100.0, "PREDOL_05": 0.2,
            },
        )

        call_command("migrate_legacy_validate", run=self.run.pk)

    def test_line_with_blank_date_is_skipped_not_crashed_on(self):
        call_command("migrate_legacy_import", run=self.run.pk)

        self.assertFalse(Purchase.objects.filter(invoice_number="800").exists())
        self.assertTrue(
            self.run.issues.filter(category=MigrationIssueCategory.RELACION_INCOMPLETA).exists()
        )
