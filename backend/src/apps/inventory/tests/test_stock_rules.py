from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import (
    Product,
    StockMovementType,
    StorageLocation,
    Supplier,
)
from apps.inventory.services import initial_inventory
from apps.inventory.selectors import current_stock

User = get_user_model()


class InitialInventoryServiceTest(TestCase):
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

    def test_initial_inventory_creates_initial_movement(self):
        movement = initial_inventory(
            product=self.product,
            quantity=25,
            user=self.user,
        )

        self.assertEqual(
            movement.movement_type,
            StockMovementType.INITIAL,
        )

        self.assertEqual(
            current_stock(self.product),
            25,
        )

    def test_initial_inventory_only_once(self):
        initial_inventory(
            product=self.product,
            quantity=10,
            user=self.user,
        )

        with self.assertRaises(InventoryError):
            initial_inventory(
                product=self.product,
                quantity=5,
                user=self.user,
            )

    def test_initial_inventory_requires_positive_quantity(self):
        with self.assertRaises(InventoryError):
            initial_inventory(
                product=self.product,
                quantity=0,
                user=self.user,
            )