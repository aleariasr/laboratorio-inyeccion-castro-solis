from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.inventory.models import Product, StorageLocation
from apps.inventory.services import initial_inventory
from apps.sales.models import Sale, SaleItem
from apps.sales.selectors import (
    confirmed_sales,
    sale_items_for_product,
    sale_total,
)
from apps.sales.services import confirm_sale

User = get_user_model()


class SaleSelectorTest(TestCase):
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

        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.user,
        )

        self.sale = Sale.objects.create(
            sale_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=2,
            unit_price=Decimal("1500.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

    def test_sale_total(self):
        self.assertEqual(
            sale_total(self.sale),
            Decimal("3000.0000"),
        )

    def test_confirmed_sales(self):
        confirm_sale(
            sale=self.sale,
            user=self.user,
        )

        self.assertEqual(
            list(confirmed_sales()),
            [self.sale],
        )

    def test_sale_items_for_product(self):
        confirm_sale(
            sale=self.sale,
            user=self.user,
        )

        self.assertEqual(
            sale_items_for_product(self.product).count(),
            1,
        )