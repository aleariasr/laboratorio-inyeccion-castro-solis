from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.inventory.models import (
    InventoryCount,
    InventoryCountItem,
    InventoryCountStatus,
    MovementDirection,
    Product,
    StockMovementType,
    StorageLocation,
)
from apps.inventory.selectors import current_stock
from apps.inventory.services import (
    approve_inventory_count,
    initial_inventory,
)

from apps.inventory.exceptions import InventoryError

User = get_user_model()


class InventoryCountServiceTest(TestCase):
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

        self.inventory_count = InventoryCount.objects.create(
            reference="INV-0001",
            count_date=date.today(),
            created_by=self.user,
            updated_by=self.user,
        )

    def test_approve_inventory_count(self):
        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=10,
            created_by=self.user,
            updated_by=self.user,
        )

        approve_inventory_count(
            inventory_count=self.inventory_count,
            user=self.user,
        )

        self.inventory_count.refresh_from_db()

        self.assertEqual(
            self.inventory_count.status,
            InventoryCountStatus.APPROVED,
        )

    def test_cannot_approve_twice(self):
        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=0,
            created_by=self.user,
            updated_by=self.user,
        )

        approve_inventory_count(
            inventory_count=self.inventory_count,
            user=self.user,
        )

        with self.assertRaises(InventoryError):
            approve_inventory_count(
                inventory_count=self.inventory_count,
                user=self.user,
            )

    def test_generates_adjustment_when_stock_is_higher(self):
        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.user,
        )

        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=15,
            created_by=self.user,
            updated_by=self.user,
        )

        approve_inventory_count(
            inventory_count=self.inventory_count,
            user=self.user,
        )

        self.assertEqual(
            current_stock(self.product),
            15,
        )

        movement = self.product.stock_movements.latest("id")

        self.assertEqual(
            movement.movement_type,
            StockMovementType.ADJUSTMENT,
        )

        self.assertEqual(
            movement.direction,
            MovementDirection.OUT,
        )

    def test_generates_adjustment_when_stock_is_lower(self):
        initial_inventory(
            product=self.product,
            quantity=10,
            user=self.user,
        )

        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=18,
            created_by=self.user,
            updated_by=self.user,
        )

        approve_inventory_count(
            inventory_count=self.inventory_count,
            user=self.user,
        )

        self.assertEqual(
            current_stock(self.product),
            18,
        )

        movement = self.product.stock_movements.latest("id")

        self.assertEqual(
            movement.direction,
            MovementDirection.IN,
        )

    def test_no_adjustment_when_stock_matches(self):
        initial_inventory(
            product=self.product,
            quantity=12,
            user=self.user,
        )

        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=12,
            created_by=self.user,
            updated_by=self.user,
        )

        approve_inventory_count(
            inventory_count=self.inventory_count,
            user=self.user,
        )

        self.assertEqual(
            self.product.stock_movements.count(),
            1,
        )