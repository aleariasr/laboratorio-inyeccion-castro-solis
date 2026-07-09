from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.inventory.models import (
    ImportCost,
    ImportCostCategory,
    Product,
    ProductCostHistory,
    Purchase,
    PurchaseItem,
    StorageLocation,
    Supplier,
    SupplierProduct,
)

from apps.inventory.services import (
    calculate_purchase_costs,
    purchase_cost_summary,
)

User = get_user_model()


class PurchaseCostServiceTest(TestCase):
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

        self.product = Product.objects.create(
            standard_code="P-001",
            name="Producto prueba",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        self.supplier = Supplier.objects.create(
            name="Proveedor",
            created_by=self.user,
            updated_by=self.user,
        )

        self.supplier_product = SupplierProduct.objects.create(
            supplier=self.supplier,
            product=self.product,
            created_by=self.user,
            updated_by=self.user,
        )

        self.purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-001",
            purchase_date=date.today(),
            currency="USD",
            exchange_rate=Decimal("500.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=self.purchase,
            supplier_product=self.supplier_product,
            quantity=10,
            unit_cost=Decimal("10.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        self.category = ImportCostCategory.objects.create(
            name="FLETE",
            created_by=self.user,
            updated_by=self.user,
        )

        ImportCost.objects.create(
            purchase=self.purchase,
            category=self.category,
            amount=Decimal("20.0000"),
            currency="USD",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_calculate_purchase_costs_creates_history(self):
        histories = calculate_purchase_costs(
            purchase=self.purchase,
            margin_percentage=Decimal("30.0000"),
            user=self.user,
        )

        self.assertEqual(len(histories), 1)
        self.assertEqual(ProductCostHistory.objects.count(), 1)

        history = histories[0]

        self.assertEqual(history.original_unit_cost, Decimal("10.0000"))
        self.assertEqual(history.cost_factor, Decimal("1.2"))
        self.assertEqual(history.final_unit_cost, Decimal("12.0000"))
        self.assertEqual(history.suggested_price, Decimal("15.6000"))

    def test_calculate_purchase_costs_creates_new_history_on_recalculation(self):
        calculate_purchase_costs(
            purchase=self.purchase,
            margin_percentage=Decimal("25.0000"),
            user=self.user,
        )

        calculate_purchase_costs(
            purchase=self.purchase,
            margin_percentage=Decimal("30.0000"),
            user=self.user,
        )

        self.assertEqual(ProductCostHistory.objects.count(), 2)

        latest_history = ProductCostHistory.objects.order_by(
            "-calculated_at",
            "-id",
        ).first()

        self.assertEqual(
            latest_history.margin_percentage,
            Decimal("30.0000"),
        )

    def test_purchase_cost_summary_returns_calculated_totals(self):
        summary = purchase_cost_summary(
            purchase=self.purchase,
            margin_percentage=Decimal("30.0000"),
        )

        self.assertEqual(summary["purchase"], self.purchase.id)
        self.assertEqual(summary["invoice_subtotal"], Decimal("100.0000"))
        self.assertEqual(summary["import_costs_total"], Decimal("20.0000"))
        self.assertEqual(summary["total_cost"], Decimal("120.0000"))
        self.assertEqual(summary["cost_factor"], Decimal("1.2"))
        self.assertEqual(summary["margin_percentage"], Decimal("30.0000"))
        self.assertEqual(summary["suggested_total"], Decimal("156.0000"))
        self.assertEqual(summary["currency"], "USD")
        self.assertEqual(summary["exchange_rate"], Decimal("500.0000"))