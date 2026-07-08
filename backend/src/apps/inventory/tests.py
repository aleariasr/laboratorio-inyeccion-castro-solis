from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.inventory.models import (
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
from apps.inventory.services import confirm_purchase

from apps.inventory.exceptions import (
    PurchaseAlreadyConfirmedError,
    PurchaseWithoutItemsError,
)

User = get_user_model()


class ConfirmPurchaseServiceTest(TestCase):
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
            name="Pieza prueba",
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
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=self.purchase,
            supplier_product=self.supplier_product,
            quantity=5,
            unit_cost=100,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_confirm_purchase_creates_stock_movements(self):
        confirm_purchase(
            purchase=self.purchase,
            user=self.user,
        )

        self.purchase.refresh_from_db()

        self.assertEqual(
            self.purchase.status,
            PurchaseStatus.CONFIRMED,
        )

        movement = StockMovement.objects.get()

        self.assertEqual(
            movement.product,
            self.product,
        )

        self.assertEqual(
            movement.quantity,
            5,
        )

        self.assertEqual(
            movement.movement_type,
            StockMovementType.ENTRY,
        )
    
    def test_cannot_confirm_twice(self):
        confirm_purchase(
            purchase=self.purchase,
            user=self.user,
        )

        with self.assertRaises(PurchaseAlreadyConfirmedError):
            confirm_purchase(
                purchase=self.purchase,
                user=self.user,
            )


    def test_purchase_without_items_raises_error(self):
        empty_purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-002",
            purchase_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        with self.assertRaises(PurchaseWithoutItemsError):
            confirm_purchase(
                purchase=empty_purchase,
                user=self.user,
            )

    def test_cancelled_purchase_cannot_be_confirmed(self):
        cancelled_purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-003",
            purchase_date=date.today(),
            currency="CRC",
            status=PurchaseStatus.CANCELLED,
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=cancelled_purchase,
            supplier_product=self.supplier_product,
            quantity=2,
            unit_cost=50,
            created_by=self.user,
            updated_by=self.user,
        )

        from apps.inventory.exceptions import PurchaseCancelledError

        with self.assertRaises(PurchaseCancelledError):
            confirm_purchase(
                purchase=cancelled_purchase,
                user=self.user,
            )