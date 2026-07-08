from django.contrib.auth import get_user_model
from django.test import TestCase

from .models import (
    Product,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
    StockMovement,
    StockMovementType,
    StorageLocation,
    Supplier,
    SupplierProduct,
)
from .services import confirm_purchase
from .selectors import get_current_stock

User = get_user_model()


class PurchaseServiceTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        self.location = StorageLocation.objects.create(
            code="A100",
            created_by=self.user,
            updated_by=self.user,
        )

        self.product = Product.objects.create(
            standard_code="DLLA150P764",
            name="Producto prueba",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        self.supplier = Supplier.objects.create(
            name="BOSCH",
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
            purchase_date="2026-07-08",
            currency="USD",
            exchange_rate=1,
            status=PurchaseStatus.DRAFT,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_confirm_purchase_creates_stock(self):

        PurchaseItem.objects.create(
            purchase=self.purchase,
            supplier_product=self.supplier_product,
            quantity=10,
            unit_cost=5,
            created_by=self.user,
            updated_by=self.user,
        )

        confirm_purchase(self.purchase)

        self.purchase.refresh_from_db()

        self.assertEqual(
            self.purchase.status,
            PurchaseStatus.CONFIRMED,
        )

        self.assertEqual(
            StockMovement.objects.count(),
            1,
        )

        self.assertEqual(
            get_current_stock(self.product),
            10,
        )

        movement = StockMovement.objects.first()

        self.assertEqual(
            movement.movement_type,
            StockMovementType.ENTRY,
        )