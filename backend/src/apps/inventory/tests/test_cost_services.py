"""
Cálculo de costos y precio sugerido con compras en colones, en dólares y
mixtas (auditoría de compras en dólares, 2026-11-07).

Los montos esperados se calculan a mano en cada test. Reglas:

    línea ₡           = costo unitario × cantidad × tipo de cambio de la compra
    costo adicional ₡ = monto × tipo de cambio del propio costo (1 en colones)
    factor            = (subtotal ₡ + costos ₡) / subtotal ₡
    costo final ₡     = costo unitario × tipo de cambio de la compra × factor
    precio sugerido ₡ = costo final ₡ × (1 + margen / 100), a 2 decimales

Los IDs (C1, U1, M1…) son los de la matriz de la sección 5 de
docs/auditoria-compras-monedas-2026-11-07.md.
"""

import importlib
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import (
    Currency,
    ImportCost,
    ImportCostCategory,
    Product,
    ProductCostHistory,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
    StorageLocation,
    Supplier,
    SupplierProduct,
)
from apps.inventory.selectors import latest_suggested_price
from apps.inventory.services import (
    calculate_purchase_costs,
    cancel_purchase,
    confirm_purchase,
    purchase_cost_summary,
)

User = get_user_model()

MARGIN = Decimal("30")


class CostCalculationTestMixin:
    def setUp(self):
        self.user = User.objects.create_user(
            username="tester",
            password="12345678",
        )

        self.location = StorageLocation.objects.create(
            code="A101",
            created_by=self.user,
            updated_by=self.user,
        )

        self.supplier = Supplier.objects.create(
            name="Proveedor",
            created_by=self.user,
            updated_by=self.user,
        )

        self.category = ImportCostCategory.objects.create(
            name="FLETE",
            created_by=self.user,
            updated_by=self.user,
        )

        self.products = {}
        self.invoice_counter = 0

    def product(self, code):
        if code not in self.products:
            product = Product.objects.create(
                standard_code=f"P-{code}",
                name=f"Producto {code}",
                storage_location=self.location,
                created_by=self.user,
                updated_by=self.user,
            )
            SupplierProduct.objects.create(
                supplier=self.supplier,
                product=product,
                created_by=self.user,
                updated_by=self.user,
            )
            self.products[code] = product

        return self.products[code]

    def make_purchase(self, currency, rate, lines, costs=()):
        """
        lines: [(código de producto, cantidad, costo unitario)]
        costs: [(monto, moneda, tipo de cambio, activo)]
        """

        self.invoice_counter += 1

        purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number=f"FAC-{self.invoice_counter:03d}",
            purchase_date=date.today(),
            currency=currency,
            exchange_rate=Decimal(rate),
            created_by=self.user,
            updated_by=self.user,
        )

        for code, quantity, unit_cost in lines:
            PurchaseItem.objects.create(
                purchase=purchase,
                supplier_product=SupplierProduct.objects.get(
                    supplier=self.supplier,
                    product=self.product(code),
                ),
                quantity=quantity,
                unit_cost=Decimal(unit_cost),
                created_by=self.user,
                updated_by=self.user,
            )

        for amount, cost_currency, cost_rate, is_active in costs:
            ImportCost.objects.create(
                purchase=purchase,
                category=self.category,
                amount=Decimal(amount),
                currency=cost_currency,
                exchange_rate=Decimal(cost_rate),
                is_active=is_active,
                created_by=self.user,
                updated_by=self.user,
            )

        return purchase

    def summary_lines(self, purchase, margin=MARGIN):
        summary = purchase_cost_summary(
            purchase=purchase,
            margin_percentage=margin,
        )

        return summary, {
            line["standard_code"]: line
            for line in summary["items"]
        }

    def assert_line(self, line, final_unit_cost, suggested_price):
        self.assertEqual(line["final_unit_cost"], Decimal(final_unit_cost))
        self.assertEqual(line["suggested_price"], Decimal(suggested_price))


class PurchaseCostMatrixTest(CostCalculationTestMixin, TestCase):
    def test_c1_colones_without_import_costs(self):
        # Subtotal ₡5 000, factor 1. A: ₡1 000 × 1,3 = ₡1 300.
        purchase = self.make_purchase(
            Currency.CRC, "1",
            [("A", 2, "1000"), ("B", 1, "3000")],
        )

        summary, lines = self.summary_lines(purchase)

        self.assertEqual(summary["invoice_subtotal"], Decimal("5000.0000"))
        self.assertEqual(summary["cost_factor"], Decimal("1"))
        self.assert_line(lines["P-A"], "1000", "1300.00")
        self.assert_line(lines["P-B"], "3000", "3900.00")

    def test_c2_colones_with_colones_cost_is_prorated(self):
        # ₡500 de costo sobre ₡5 000: factor 1,1. A carga 2 000/5 000 del
        # costo (₡200) → ₡1 100 por unidad; B carga ₡300 → ₡3 300.
        purchase = self.make_purchase(
            Currency.CRC, "1",
            [("A", 2, "1000"), ("B", 1, "3000")],
            [("500", Currency.CRC, "1", True)],
        )

        summary, lines = self.summary_lines(purchase)

        self.assertEqual(summary["cost_factor"], Decimal("1.1"))
        self.assertEqual(summary["total_cost"], Decimal("5500.0000"))
        self.assert_line(lines["P-A"], "1100", "1430.00")
        self.assert_line(lines["P-B"], "3300", "4290.00")

    def test_u1_dollars_without_import_costs_converts_to_colones(self):
        # US$45 × 520 = ₡23 400. A: US$10 × 520 = ₡5 200 → ₡6 760.
        purchase = self.make_purchase(
            Currency.USD, "520",
            [("A", 2, "10"), ("B", 1, "25")],
        )

        summary, lines = self.summary_lines(purchase)

        self.assertEqual(summary["invoice_subtotal_original"], Decimal("45.0000"))
        self.assertEqual(summary["invoice_subtotal"], Decimal("23400.0000"))
        self.assertEqual(summary["exchange_rate"], Decimal("520"))
        self.assertEqual(lines["P-A"]["original_unit_cost"], Decimal("10"))
        self.assertEqual(lines["P-A"]["original_unit_cost_crc"], Decimal("5200.0000"))
        self.assert_line(lines["P-A"], "5200", "6760.00")
        self.assert_line(lines["P-B"], "13000", "16900.00")

    def test_u2_dollars_with_dollar_cost(self):
        # Costo US$9 × 520 = ₡4 680. Factor (23 400 + 4 680) / 23 400 = 1,2.
        purchase = self.make_purchase(
            Currency.USD, "520",
            [("A", 2, "10"), ("B", 1, "25")],
            [("9", Currency.USD, "520", True)],
        )

        summary, lines = self.summary_lines(purchase)

        self.assertEqual(summary["import_costs_total"], Decimal("4680.0000"))
        self.assertEqual(summary["cost_factor"], Decimal("1.2"))
        self.assert_line(lines["P-A"], "6240", "8112.00")
        self.assert_line(lines["P-B"], "15600", "20280.00")

    def test_m1_dollars_with_colones_freight_adds_exactly_what_was_paid(self):
        # Flete local de ₡4 680: suma ₡4 680, ni más ni menos. Antes se
        # pasaba a dólares con el tipo de cambio del costo (515) y volvía
        # a colones con el de la compra (520): ₡4 725,44.
        purchase = self.make_purchase(
            Currency.USD, "520",
            [("A", 2, "10"), ("B", 1, "25")],
            [("4680", Currency.CRC, "1", True)],
        )

        summary, lines = self.summary_lines(purchase)

        self.assertEqual(summary["import_costs_total"], Decimal("4680.0000"))
        self.assertEqual(summary["import_costs"][0]["amount_crc"], Decimal("4680.0000"))
        self.assertEqual(summary["cost_factor"], Decimal("1.2"))
        self.assert_line(lines["P-A"], "6240", "8112.00")
        self.assert_line(lines["P-B"], "15600", "20280.00")

    def test_m2_colones_with_dollar_cost_uses_the_cost_exchange_rate(self):
        # US$10 × 515 = ₡5 150. Factor (5 000 + 5 150) / 5 000 = 2,03.
        purchase = self.make_purchase(
            Currency.CRC, "1",
            [("A", 2, "1000"), ("B", 1, "3000")],
            [("10", Currency.USD, "515", True)],
        )

        summary, lines = self.summary_lines(purchase)

        self.assertEqual(summary["import_costs_total"], Decimal("5150.0000"))
        self.assertEqual(summary["cost_factor"], Decimal("2.03"))
        self.assert_line(lines["P-A"], "2030", "2639.00")
        self.assert_line(lines["P-B"], "6090", "7917.00")

    def test_m3_mixed_costs_and_inactive_cost_is_ignored(self):
        # Subtotal US$65 × 520 = ₡33 800. Costos: US$10 × 515 = ₡5 150 +
        # ₡1 610 = ₡6 760 (el inactivo de ₡9 999 no cuenta). Factor 1,2.
        purchase = self.make_purchase(
            Currency.USD, "520",
            [("A", 2, "10"), ("B", 1, "25"), ("C", 4, "5")],
            [
                ("10", Currency.USD, "515", True),
                ("1610", Currency.CRC, "1", True),
                ("9999", Currency.CRC, "1", False),
            ],
        )

        summary, lines = self.summary_lines(purchase)

        self.assertEqual(summary["import_costs_total"], Decimal("6760.0000"))
        self.assertEqual(len(summary["import_costs"]), 2)
        self.assertEqual(summary["cost_factor"], Decimal("1.2"))
        self.assert_line(lines["P-A"], "6240", "8112.00")
        self.assert_line(lines["P-B"], "15600", "20280.00")
        self.assert_line(lines["P-C"], "3120", "4056.00")

    def test_m4_each_dollar_cost_uses_its_own_exchange_rate(self):
        # US$5 × 510 = ₡2 550 y US$5 × 520 = ₡2 600: ₡5 150 sobre ₡10 000.
        purchase = self.make_purchase(
            Currency.CRC, "1",
            [("A", 10, "1000")],
            [
                ("5", Currency.USD, "510", True),
                ("5", Currency.USD, "520", True),
            ],
        )

        summary, lines = self.summary_lines(purchase)

        self.assertEqual(summary["import_costs_total"], Decimal("5150.0000"))
        self.assertEqual(summary["cost_factor"], Decimal("1.515"))
        self.assert_line(lines["P-A"], "1515", "1969.50")

    def test_e7_margin_zero_and_decimal_margin(self):
        purchase = self.make_purchase(
            Currency.USD, "520",
            [("A", 1, "10")],
        )

        _, lines = self.summary_lines(purchase, margin=Decimal("0"))
        self.assert_line(lines["P-A"], "5200", "5200.00")

        # ₡5 200 × 1,125 = ₡5 850.
        _, lines = self.summary_lines(purchase, margin=Decimal("12.5"))
        self.assert_line(lines["P-A"], "5200", "5850.00")

    def test_e7_suggested_price_is_rounded_to_two_decimals(self):
        # Factor 4 000 / 3 000 = 1,333333 (6 decimales). Costo final
        # ₡1 333,3330; × 1,3 = ₡1 733,3329 → ₡1 733,33.
        purchase = self.make_purchase(
            Currency.CRC, "1",
            [("A", 3, "1000")],
            [("1000", Currency.CRC, "1", True)],
        )

        summary, lines = self.summary_lines(purchase)

        self.assertEqual(summary["cost_factor"], Decimal("1.333333"))
        self.assert_line(lines["P-A"], "1333.3330", "1733.33")

    def test_e8_small_amounts_do_not_lose_money_to_rounding(self):
        # 1 000 × US$0,15 × 600 = ₡90 000 + ₡3 500 = ₡93 500.
        # Factor 1,038889; costo final ₡90 × 1,038889 = ₡93,5000.
        # 1 000 unidades × ₡93,50 = ₡93 500: cuadra con el total.
        purchase = self.make_purchase(
            Currency.USD, "600",
            [("A", 1000, "0.15")],
            [("3500", Currency.CRC, "1", True)],
        )

        summary, lines = self.summary_lines(purchase)

        self.assertEqual(summary["total_cost"], Decimal("93500.0000"))
        self.assert_line(lines["P-A"], "93.5000", "121.55")
        self.assertLessEqual(
            abs(lines["P-A"]["final_unit_cost"] * 1000 - summary["total_cost"]),
            Decimal("1"),
        )

    def test_e9_exchange_rate_with_four_decimals(self):
        # US$10 × 519,8750 = ₡5 198,75; × 1,3 = ₡6 758,375 → ₡6 758,38.
        purchase = self.make_purchase(
            Currency.USD, "519.8750",
            [("A", 1, "10")],
        )

        _, lines = self.summary_lines(purchase)

        self.assert_line(lines["P-A"], "5198.75", "6758.38")

    def test_dollar_purchase_with_exchange_rate_one_cannot_be_calculated(self):
        # Era el origen del reporte del cliente: con tipo de cambio 1 un
        # repuesto de US$10 quedaba a ₡13 (₡10 + 30 %).
        purchase = self.make_purchase(
            Currency.USD, "1",
            [("A", 1, "10")],
        )

        with self.assertRaises(InventoryError):
            purchase_cost_summary(purchase=purchase, margin_percentage=MARGIN)

        with self.assertRaises(InventoryError):
            calculate_purchase_costs(
                purchase=purchase,
                margin_percentage=MARGIN,
                user=self.user,
            )

        self.assertFalse(ProductCostHistory.objects.exists())

    def test_dollar_cost_with_invalid_exchange_rate_cannot_be_calculated(self):
        purchase = self.make_purchase(
            Currency.CRC, "1",
            [("A", 1, "1000")],
            [("10", Currency.USD, "1", True)],
        )

        with self.assertRaises(InventoryError):
            purchase_cost_summary(purchase=purchase, margin_percentage=MARGIN)


class PurchaseCostApplyTest(CostCalculationTestMixin, TestCase):
    def test_calculation_stores_colones_and_the_purchase_original_cost(self):
        purchase = self.make_purchase(
            Currency.USD, "520",
            [("A", 2, "10"), ("B", 1, "25")],
            [("4680", Currency.CRC, "1", True)],
        )

        histories = calculate_purchase_costs(
            purchase=purchase,
            margin_percentage=MARGIN,
            user=self.user,
        )

        history = next(h for h in histories if h.product == self.product("A"))

        self.assertEqual(len(histories), 2)
        self.assertEqual(history.original_unit_cost, Decimal("10.0000"))
        self.assertEqual(history.currency, Currency.USD)
        self.assertEqual(history.exchange_rate, Decimal("520"))
        self.assertEqual(history.cost_factor, Decimal("1.2"))
        self.assertEqual(history.final_unit_cost, Decimal("6240"))
        self.assertEqual(history.suggested_price, Decimal("8112.00"))

    def test_u1_confirmed_dollar_purchase_sets_the_sale_price_in_colones(self):
        purchase = self.make_purchase(
            Currency.USD, "520",
            [("A", 2, "10")],
        )

        calculate_purchase_costs(
            purchase=purchase,
            margin_percentage=MARGIN,
            user=self.user,
        )
        confirm_purchase(purchase=purchase, user=self.user)

        # US$10 × 520 × 1,3 = ₡6 760, nunca ₡13.
        self.assertEqual(
            latest_suggested_price(self.product("A")),
            Decimal("6760.00"),
        )

    def test_e2_recalculating_replaces_the_previous_calculation(self):
        purchase = self.make_purchase(
            Currency.USD, "520",
            [("A", 1, "10"), ("B", 1, "20")],
        )

        for margin in ("20", "25", "30"):
            calculate_purchase_costs(
                purchase=purchase,
                margin_percentage=Decimal(margin),
                user=self.user,
            )

        self.assertEqual(
            ProductCostHistory.objects.filter(purchase=purchase).count(),
            2,
        )
        self.assertEqual(
            set(
                ProductCostHistory.objects.values_list(
                    "margin_percentage", flat=True
                )
            ),
            {Decimal("30")},
        )

    def test_confirmed_purchase_can_be_recalculated_with_another_margin(self):
        purchase = self.make_purchase(
            Currency.CRC, "1",
            [("A", 1, "1000")],
        )

        confirm_purchase(purchase=purchase, user=self.user)
        calculate_purchase_costs(
            purchase=purchase,
            margin_percentage=Decimal("30"),
            user=self.user,
        )
        calculate_purchase_costs(
            purchase=purchase,
            margin_percentage=Decimal("50"),
            user=self.user,
        )

        self.assertEqual(ProductCostHistory.objects.count(), 1)
        self.assertEqual(
            latest_suggested_price(self.product("A")),
            Decimal("1500.00"),
        )

    def test_cancelled_purchase_cannot_be_calculated(self):
        purchase = self.make_purchase(
            Currency.CRC, "1",
            [("A", 1, "1000")],
        )

        cancel_purchase(purchase=purchase, user=self.user, reason="Prueba.")

        with self.assertRaises(InventoryError):
            calculate_purchase_costs(
                purchase=purchase,
                margin_percentage=MARGIN,
                user=self.user,
            )

    def test_e3_the_last_confirmed_purchase_sets_the_price(self):
        # Se calcula primero la compra en colones y después la de dólares,
        # pero se confirma primero la de dólares: rige la de colones, que
        # es la última mercadería que entró. Antes regía el último cálculo.
        usd_purchase = self.make_purchase(
            Currency.USD, "520",
            [("A", 1, "10")],
        )
        crc_purchase = self.make_purchase(
            Currency.CRC, "1",
            [("A", 1, "6000")],
        )

        calculate_purchase_costs(
            purchase=crc_purchase,
            margin_percentage=Decimal("0"),
            user=self.user,
        )
        calculate_purchase_costs(
            purchase=usd_purchase,
            margin_percentage=Decimal("0"),
            user=self.user,
        )

        confirm_purchase(purchase=usd_purchase, user=self.user)
        confirm_purchase(purchase=crc_purchase, user=self.user)

        now = timezone.now()
        Purchase.objects.filter(pk=usd_purchase.pk).update(
            confirmed_at=now - timedelta(hours=1),
        )
        Purchase.objects.filter(pk=crc_purchase.pk).update(confirmed_at=now)

        self.assertEqual(
            latest_suggested_price(self.product("A")),
            Decimal("6000.00"),
        )


class CostsInColonesMigrationTest(CostCalculationTestMixin, TestCase):
    """E14: la migración 0030 deja el precio de cada producto igual."""

    def setUp(self):
        super().setUp()
        self.migration = importlib.import_module(
            "apps.inventory.migrations.0030_costs_in_colones"
        )

    def test_old_dollar_calculations_and_costs_are_converted(self):
        purchase = self.make_purchase(
            Currency.USD, "520",
            [("A", 1, "10")],
            [
                # Antes: en la moneda de la compra → 1; en colones → el
                # tipo de cambio para pasarlo a dólares.
                ("20", Currency.USD, "1", True),
                ("5150", Currency.CRC, "515", True),
            ],
        )
        purchase.status = PurchaseStatus.CONFIRMED
        purchase.save(update_fields=["status"])

        # Un cálculo viejo, en dólares: el selector lo multiplicaba por 520.
        history = ProductCostHistory.objects.create(
            product=self.product("A"),
            purchase=purchase,
            original_unit_cost=Decimal("10.0000"),
            cost_factor=Decimal("1.300000"),
            final_unit_cost=Decimal("13.0000"),
            currency=Currency.USD,
            exchange_rate=Decimal("520.0000"),
            margin_percentage=Decimal("30"),
            suggested_price=Decimal("16.9000"),
            created_by=self.user,
            updated_by=self.user,
        )
        crc_history = ProductCostHistory.objects.create(
            product=self.product("B"),
            purchase=purchase,
            original_unit_cost=Decimal("1000.0000"),
            cost_factor=Decimal("1.000000"),
            final_unit_cost=Decimal("1000.0000"),
            currency=Currency.CRC,
            exchange_rate=Decimal("1.0000"),
            margin_percentage=Decimal("30"),
            suggested_price=Decimal("1300.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        self.migration.forwards(django_apps, None)

        history.refresh_from_db()
        crc_history.refresh_from_db()

        # US$13 × 520 = ₡6 760; US$16,90 × 520 = ₡8 788 (lo mismo que
        # calculaba el selector antes de la migración).
        self.assertEqual(history.final_unit_cost, Decimal("6760.0000"))
        self.assertEqual(history.suggested_price, Decimal("8788.0000"))
        self.assertEqual(history.original_unit_cost, Decimal("10.0000"))
        self.assertEqual(crc_history.suggested_price, Decimal("1300.0000"))
        self.assertEqual(
            latest_suggested_price(self.product("A")),
            Decimal("8788.0000"),
        )

        usd_cost = purchase.import_costs.get(currency=Currency.USD)
        crc_cost = purchase.import_costs.get(currency=Currency.CRC)

        self.assertEqual(usd_cost.exchange_rate, Decimal("520.0000"))
        self.assertEqual(crc_cost.exchange_rate, Decimal("1"))

    def test_dollar_cost_of_colones_purchase_keeps_its_exchange_rate(self):
        purchase = self.make_purchase(
            Currency.CRC, "1",
            [("A", 1, "1000")],
            [("10", Currency.USD, "515", True)],
        )

        self.migration.forwards(django_apps, None)

        self.assertEqual(
            purchase.import_costs.get().exchange_rate,
            Decimal("515.0000"),
        )


class FixPurchaseExchangeRateCommandTest(CostCalculationTestMixin, TestCase):
    """P9: compras en dólares que quedaron con tipo de cambio 1."""

    def make_broken_purchase(self):
        purchase = self.make_purchase(
            Currency.USD, "1",
            [("A", 1, "10")],
            [("2", Currency.USD, "1", True)],
        )
        confirm_purchase(purchase=purchase, user=self.user)

        # Lo que dejaba el cálculo viejo: "₡13" que eran US$13.
        ProductCostHistory.objects.create(
            product=self.product("A"),
            purchase=purchase,
            original_unit_cost=Decimal("10.0000"),
            cost_factor=Decimal("1.200000"),
            final_unit_cost=Decimal("12.0000"),
            currency=Currency.USD,
            exchange_rate=Decimal("1.0000"),
            margin_percentage=Decimal("30"),
            suggested_price=Decimal("15.6000"),
            created_by=self.user,
            updated_by=self.user,
        )

        return Purchase.objects.get(pk=purchase.pk)

    def run_command(self, **options):
        out = StringIO()
        call_command("fix_purchase_exchange_rate", stdout=out, **options)
        return out.getvalue()

    def test_lists_purchases_with_invalid_exchange_rate(self):
        purchase = self.make_broken_purchase()

        output = self.run_command()

        self.assertIn(purchase.invoice_number, output)
        self.assertIn("con costos aplicados", output)

    def test_reports_nothing_when_everything_is_fine(self):
        self.make_purchase(Currency.USD, "520", [("A", 1, "10")])

        output = self.run_command()

        self.assertIn("No hay compras ni costos", output)

    def test_dry_run_changes_nothing(self):
        purchase = self.make_broken_purchase()

        self.run_command(purchase=purchase.id, rate="520")

        purchase.refresh_from_db()

        self.assertEqual(purchase.exchange_rate, Decimal("1"))
        self.assertEqual(
            latest_suggested_price(self.product("A")),
            Decimal("15.6000"),
        )

    def test_apply_fixes_the_rate_the_costs_and_the_price(self):
        purchase = self.make_broken_purchase()

        self.run_command(purchase=purchase.id, rate="520", apply=True)

        purchase.refresh_from_db()

        self.assertEqual(purchase.exchange_rate, Decimal("520"))
        self.assertEqual(
            purchase.import_costs.get().exchange_rate,
            Decimal("520"),
        )
        # (US$10 × 520 + US$2 × 520) / ₡5 200 = 1,2 → ₡6 240 × 1,3 = ₡8 112.
        self.assertEqual(
            latest_suggested_price(self.product("A")),
            Decimal("8112.00"),
        )
        self.assertEqual(ProductCostHistory.objects.count(), 1)

    def test_a_cost_can_have_its_own_exchange_rate(self):
        purchase = self.make_broken_purchase()
        cost = purchase.import_costs.get()

        self.run_command(
            purchase=purchase.id,
            rate="520",
            cost=[f"{cost.id}=500"],
            apply=True,
        )

        cost.refresh_from_db()

        self.assertEqual(cost.exchange_rate, Decimal("500"))

    def test_rejects_an_unreal_exchange_rate(self):
        purchase = self.make_broken_purchase()

        with self.assertRaises(CommandError):
            self.run_command(purchase=purchase.id, rate="1", apply=True)
