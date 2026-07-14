from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_SALES

from apps.customers.models import Customer
from apps.inventory.models import (
    Product,
    StockMovement,
    StockMovementType,
    StorageLocation,
)
from apps.inventory.selectors import current_stock
from apps.inventory.services import initial_inventory
from apps.sales.models import Sale, SaleItem, SaleStatus

User = get_user_model()


class SaleApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        sales_group, _ = Group.objects.get_or_create(
            name=ROLE_SALES,
        )
        self.user.groups.add(sales_group)

        self.client.force_authenticate(self.user)

        self.customer = Customer.objects.create(
            display_name="Cliente prueba",
            phone="8888-0000",
            created_by=self.user,
            updated_by=self.user,
        )

        self.location = StorageLocation.objects.create(
            code="A101",
            description="Ubicación A101",
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
            customer=self.customer,
            sale_date=date.today(),
            currency="CRC",
            exchange_rate=Decimal("1.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        self.sale_item = SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=3,
            unit_price=Decimal("100.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_sales(self):
        response = self.client.get("/api/sales/sales/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]
        self.assertIn("cancellation_reason", item)

        self.assertEqual(item["customer"], self.customer.id)
        self.assertEqual(
            item["customer_detail"]["display_name"],
            "CLIENTE PRUEBA",
        )
        self.assertEqual(item["status"], SaleStatus.DRAFT)
        self.assertIn("confirmed_at", item)
        self.assertIn("confirmed_by", item)
        self.assertIn("cancelled_at", item)
        self.assertIn("cancelled_by", item)
        self.assertEqual(len(item["items"]), 1)

    def test_create_sale(self):
        response = self.client.post(
            "/api/sales/sales/",
            {
                "customer": self.customer.id,
                "sale_date": str(date.today()),
                "currency": "crc",
                "exchange_rate": "1.0000",
                "notes": "Venta de prueba",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        sale = Sale.objects.get(id=response.data["id"])

        self.assertEqual(sale.customer, self.customer)
        self.assertEqual(sale.currency, "CRC")
        self.assertEqual(sale.status, SaleStatus.DRAFT)
        self.assertEqual(sale.created_by, self.user)
        self.assertEqual(sale.updated_by, self.user)

    def test_update_draft_sale(self):
        response = self.client.patch(
            f"/api/sales/sales/{self.sale.id}/",
            {
                "notes": "Nota actualizada",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.sale.refresh_from_db()

        self.assertEqual(self.sale.notes, "Nota actualizada")
        self.assertEqual(self.sale.updated_by, self.user)

    def test_create_sale_item(self):
        sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            "/api/sales/sale-items/",
            {
                "sale": sale.id,
                "product": self.product.id,
                "quantity": 2,
                "unit_price": "250.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        sale_item = SaleItem.objects.get(id=response.data["id"])

        self.assertEqual(sale_item.sale, sale)
        self.assertEqual(sale_item.product, self.product)
        self.assertEqual(sale_item.quantity, 2)
        self.assertEqual(sale_item.unit_price, Decimal("250.0000"))
        self.assertEqual(sale_item.created_by, self.user)
        self.assertEqual(sale_item.updated_by, self.user)

    def test_confirm_sale_creates_exit_movement(self):
        response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.sale.refresh_from_db()

        self.assertEqual(self.sale.status, SaleStatus.CONFIRMED)
        self.assertIsNotNone(self.sale.confirmed_at)
        self.assertEqual(self.sale.confirmed_by, self.user)
        self.assertIsNone(self.sale.cancelled_at)
        self.assertIsNone(self.sale.cancelled_by)
        self.assertEqual(current_stock(self.product), 7)

        movement = StockMovement.objects.filter(
            sale_item=self.sale_item,
            movement_type=StockMovementType.EXIT,
        ).get()

        self.assertEqual(movement.product, self.product)
        self.assertEqual(movement.quantity, 3)

    def test_confirm_sale_without_items_returns_400(self):
        sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            f"/api/sales/sales/{sale.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        sale.refresh_from_db()

        self.assertEqual(sale.status, SaleStatus.DRAFT)

    def test_confirm_sale_with_insufficient_stock_returns_400(self):
        sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=sale,
            product=self.product,
            quantity=20,
            unit_price=Decimal("100.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            f"/api/sales/sales/{sale.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        sale.refresh_from_db()

        self.assertEqual(sale.status, SaleStatus.DRAFT)
        self.assertEqual(current_stock(self.product), 10)

    def test_cannot_confirm_sale_twice(self):
        first_response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)

        second_response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(
            second_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        exit_movements = StockMovement.objects.filter(
            sale_item=self.sale_item,
            movement_type=StockMovementType.EXIT,
        )

        self.assertEqual(exit_movements.count(), 1)

    def test_cancel_confirmed_sale_restores_stock_with_reversal(self):
        confirm_response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(
            confirm_response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            current_stock(self.product),
            7,
        )

        original_movement = StockMovement.objects.get(
            sale_item=self.sale_item,
            movement_type=StockMovementType.EXIT,
        )

        cancel_response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/cancel/",
            {
                "reason": "Venta registrada por error.",
            },
            format="json",
        )

        self.assertEqual(
            cancel_response.status_code,
            status.HTTP_200_OK,
        )

        self.sale.refresh_from_db()

        self.assertEqual(
            self.sale.status,
            SaleStatus.CANCELLED,
        )
        self.assertEqual(
            self.sale.cancellation_reason,
            "Venta registrada por error.",
        )
        self.assertIsNotNone(self.sale.confirmed_at)
        self.assertEqual(
            self.sale.confirmed_by,
            self.user,
        )
        self.assertIsNotNone(self.sale.cancelled_at)
        self.assertEqual(
            self.sale.cancelled_by,
            self.user,
        )
        self.assertEqual(
            current_stock(self.product),
            10,
        )

        reversal = StockMovement.objects.get(
            sale_item=self.sale_item,
            movement_type=StockMovementType.REVERSAL,
        )

        self.assertEqual(
            reversal.direction,
            "IN",
        )
        self.assertEqual(
            reversal.quantity,
            original_movement.quantity,
        )
        self.assertEqual(
            reversal.reverses_movement,
            original_movement,
        )

    def test_cannot_cancel_draft_sale(self):
        response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/cancel/",
            {
                "reason": "Intento de anulación.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.sale.refresh_from_db()

        self.assertEqual(self.sale.status, SaleStatus.DRAFT)

    def test_cannot_modify_confirmed_sale(self):
        confirm_response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)

        update_response = self.client.patch(
            f"/api/sales/sales/{self.sale.id}/",
            {
                "notes": "No debe cambiar",
            },
            format="json",
        )

        self.assertEqual(
            update_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.sale.refresh_from_db()

        self.assertNotEqual(self.sale.notes, "No debe cambiar")

    def test_cannot_modify_item_from_confirmed_sale(self):
        confirm_response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)

        update_response = self.client.patch(
            f"/api/sales/sale-items/{self.sale_item.id}/",
            {
                "quantity": 10,
            },
            format="json",
        )

        self.assertEqual(
            update_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.sale_item.refresh_from_db()

        self.assertEqual(self.sale_item.quantity, 3)

    def test_cancel_sale_requires_reason(self):
        confirm_response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(
            confirm_response.status_code,
            status.HTTP_200_OK,
        )

        response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn(
            "reason",
            response.data,
        )

        self.sale.refresh_from_db()

        self.assertEqual(
            self.sale.status,
            SaleStatus.CONFIRMED,
        )

    def test_cannot_cancel_sale_twice(self):
        confirm_response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(
            confirm_response.status_code,
            status.HTTP_200_OK,
        )

        first_response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/cancel/",
            {
                "reason": "Venta duplicada.",
            },
            format="json",
        )

        self.assertEqual(
            first_response.status_code,
            status.HTTP_200_OK,
        )

        second_response = self.client.post(
            f"/api/sales/sales/{self.sale.id}/cancel/",
            {
                "reason": "Segundo intento.",
            },
            format="json",
        )

        self.assertEqual(
            second_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.sale.refresh_from_db()

        self.assertEqual(
            self.sale.cancellation_reason,
            "Venta duplicada.",
        )

        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovementType.REVERSAL,
            ).count(),
            1,
        )