from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.inventory.models import Product, StorageLocation
from apps.inventory.selectors import current_stock
from apps.inventory.services import initial_inventory
from apps.sales.exceptions import (
    InsufficientStockError,
    SaleAlreadyCancelledError,
    SaleAlreadyConfirmedError,
    SaleCancelledError,
    SaleNotConfirmedError,
    SaleWithoutItemsError,
)
from apps.sales.models import Sale, SaleItem, SaleStatus
from apps.sales.services import (
    cancel_sale,
    confirm_sale,
)

User = get_user_model()


class ConfirmSaleServiceTest(TestCase):
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
            quantity=10,
            user=self.user,
        )

        self.sale = Sale.objects.create(
            sale_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_confirm_sale_decreases_stock(self):
        SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=3,
            unit_price=100,
            created_by=self.user,
            updated_by=self.user,
        )

        confirm_sale(
            sale=self.sale,
            user=self.user,
        )

        self.sale.refresh_from_db()

        self.assertEqual(
            self.sale.status,
            SaleStatus.CONFIRMED,
        )

        self.assertEqual(
            current_stock(self.product),
            7,
        )

    def test_sale_without_items_raises_error(self):
        with self.assertRaises(SaleWithoutItemsError):
            confirm_sale(
                sale=self.sale,
                user=self.user,
            )

    def test_insufficient_stock_raises_error(self):
        SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=20,
            unit_price=100,
            created_by=self.user,
            updated_by=self.user,
        )

        with self.assertRaises(InsufficientStockError):
            confirm_sale(
                sale=self.sale,
                user=self.user,
            )

    def test_cannot_confirm_twice(self):
        SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=1,
            unit_price=100,
            created_by=self.user,
            updated_by=self.user,
        )

        confirm_sale(
            sale=self.sale,
            user=self.user,
        )

        with self.assertRaises(SaleAlreadyConfirmedError):
            confirm_sale(
                sale=self.sale,
                user=self.user,
            )

    def test_cancel_sale_restores_stock(self):
        SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=4,
            unit_price=100,
            created_by=self.user,
            updated_by=self.user,
        )

        confirm_sale(
            sale=self.sale,
            user=self.user,
        )

        self.assertEqual(
            current_stock(self.product),
            6,
        )

        cancel_sale(
            sale=self.sale,
            user=self.user,
        )

        self.sale.refresh_from_db()

        self.assertEqual(
            self.sale.status,
            SaleStatus.CANCELLED,
        )

        self.assertEqual(
            current_stock(self.product),
            10,
        )


    def test_cannot_cancel_draft_sale(self):
        with self.assertRaises(SaleNotConfirmedError):
            cancel_sale(
                sale=self.sale,
                user=self.user,
            )