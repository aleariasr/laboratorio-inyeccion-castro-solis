from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.inventory.models import (
    Product,
    StorageLocation,
)
from apps.inventory.selectors import (
    current_stock,
    current_stock_bulk,
    low_stock_products,
    stock_history,
)
from apps.inventory.services import (
    adjust_stock,
    initial_inventory,
)

User = get_user_model()


class StockSelectorTest(TestCase):
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
            name="Producto A",
            storage_location=self.location,
            minimum_stock=5,
            created_by=self.user,
            updated_by=self.user,
        )

        self.product2 = Product.objects.create(
            standard_code="P-002",
            name="Producto B",
            storage_location=self.location,
            minimum_stock=10,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_stock_history(self):
        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.user,
        )

        adjust_stock(
            product=self.product,
            quantity=-3,
            user=self.user,
            notes="Prueba",
        )

        history = stock_history(self.product)

        self.assertEqual(history.count(), 2)

    def test_current_stock_bulk(self):
        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.user,
        )

        initial_inventory(
            product=self.product2,
            quantity=8,
            user=self.user,
        )

        products = {
            p.standard_code: p.current_stock
            for p in current_stock_bulk()
        }

        self.assertEqual(products["P-001"], 20)
        self.assertEqual(products["P-002"], 8)

    def test_low_stock_products(self):
        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.user,
        )

        initial_inventory(
            product=self.product2,
            quantity=8,
            user=self.user,
        )

        products = list(low_stock_products())

        self.assertEqual(len(products), 1)
        self.assertEqual(
            products[0].standard_code,
            "P-002",
        )

    def test_current_stock(self):
        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.user,
        )

        adjust_stock(
            product=self.product,
            quantity=-5,
            user=self.user,
            notes="Salida",
        )

        self.assertEqual(
            current_stock(self.product),
            15,
        )