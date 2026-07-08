from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import (
    MovementDirection,
    Product,
    StockMovementType,
    StorageLocation,
)
from apps.inventory.selectors import current_stock
from apps.inventory.services import (
    adjust_stock,
    initial_inventory,
)

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
            movement.direction,
            MovementDirection.IN,
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

    def test_positive_adjustment(self):
        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.user,
        )

        movement = adjust_stock(
            product=self.product,
            quantity=5,
            user=self.user,
            notes="Conteo físico",
        )

        self.assertEqual(
            movement.direction,
            MovementDirection.IN,
        )

        self.assertEqual(
            current_stock(self.product),
            25,
        )

    def test_negative_adjustment(self):
        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.user,
        )

        movement = adjust_stock(
            product=self.product,
            quantity=-8,
            user=self.user,
            notes="Piezas dañadas",
        )

        self.assertEqual(
            movement.direction,
            MovementDirection.OUT,
        )

        self.assertEqual(
            current_stock(self.product),
            12,
        )

    def test_adjustment_cannot_be_zero(self):
        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.user,
        )

        with self.assertRaises(InventoryError):
            adjust_stock(
                product=self.product,
                quantity=0,
                user=self.user,
                notes="Inválido",
            )