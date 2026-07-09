from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

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
    ImportCost,
    ImportCostCategory,
    ProductCostHistory,
)
from apps.inventory.selectors import current_stock

User = get_user_model()


class PurchaseApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        self.client.force_authenticate(self.user)

        self.location = StorageLocation.objects.create(
            code="A101",
            description="Ubicación A101",
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
            supplier_reference="SUP-P001",
            manufacturer="Bosch",
            created_by=self.user,
            updated_by=self.user,
        )

        self.purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-001",
            purchase_date=date.today(),
            currency="CRC",
            exchange_rate=Decimal("1.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        self.purchase_item = PurchaseItem.objects.create(
            purchase=self.purchase,
            supplier_product=self.supplier_product,
            quantity=5,
            unit_cost=Decimal("100.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_purchases(self):
        response = self.client.get("/api/inventory/purchases/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

        self.assertEqual(item["invoice_number"], "FAC-001")
        self.assertEqual(item["supplier"], self.supplier.id)
        self.assertEqual(item["supplier_detail"]["name"], "PROVEEDOR")
        self.assertEqual(item["status"], PurchaseStatus.DRAFT)
        self.assertEqual(len(item["items"]), 1)

    def test_create_purchase(self):
        response = self.client.post(
            "/api/inventory/purchases/",
            {
                "supplier": self.supplier.id,
                "invoice_number": "fac-002",
                "purchase_date": str(date.today()),
                "currency": "crc",
                "exchange_rate": "1.0000",
                "notes": "Compra de prueba",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        purchase = Purchase.objects.get(id=response.data["id"])

        self.assertEqual(purchase.invoice_number, "FAC-002")
        self.assertEqual(purchase.currency, "CRC")
        self.assertEqual(purchase.status, PurchaseStatus.DRAFT)
        self.assertEqual(purchase.created_by, self.user)
        self.assertEqual(purchase.updated_by, self.user)

    def test_update_draft_purchase(self):
        response = self.client.patch(
            f"/api/inventory/purchases/{self.purchase.id}/",
            {
                "notes": "Nota actualizada",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.purchase.refresh_from_db()

        self.assertEqual(self.purchase.notes, "Nota actualizada")
        self.assertEqual(self.purchase.updated_by, self.user)

    def test_create_purchase_item(self):
        purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-003",
            purchase_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            "/api/inventory/purchase-items/",
            {
                "purchase": purchase.id,
                "supplier_product": self.supplier_product.id,
                "quantity": 3,
                "unit_cost": "250.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        purchase_item = PurchaseItem.objects.get(id=response.data["id"])

        self.assertEqual(purchase_item.purchase, purchase)
        self.assertEqual(purchase_item.supplier_product, self.supplier_product)
        self.assertEqual(purchase_item.quantity, 3)
        self.assertEqual(purchase_item.unit_cost, Decimal("250.0000"))
        self.assertEqual(purchase_item.created_by, self.user)
        self.assertEqual(purchase_item.updated_by, self.user)

    def test_confirm_purchase_creates_stock_movement(self):
        response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.purchase.refresh_from_db()

        self.assertEqual(self.purchase.status, PurchaseStatus.CONFIRMED)
        self.assertEqual(current_stock(self.product), 5)

        movement = StockMovement.objects.get()

        self.assertEqual(movement.product, self.product)
        self.assertEqual(movement.quantity, 5)
        self.assertEqual(movement.movement_type, StockMovementType.ENTRY)
        self.assertEqual(movement.purchase_item, self.purchase_item)

    def test_confirm_purchase_without_items_returns_400(self):
        purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-004",
            purchase_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            f"/api/inventory/purchases/{purchase.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        purchase.refresh_from_db()

        self.assertEqual(purchase.status, PurchaseStatus.DRAFT)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_cannot_confirm_purchase_twice(self):
        first_response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)

        second_response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(
            second_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertEqual(StockMovement.objects.count(), 1)

    def test_cancel_draft_purchase(self):
        response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.purchase.refresh_from_db()

        self.assertEqual(self.purchase.status, PurchaseStatus.CANCELLED)

    def test_cannot_cancel_confirmed_purchase(self):
        confirm_response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)

        cancel_response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(
            cancel_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.purchase.refresh_from_db()

        self.assertEqual(self.purchase.status, PurchaseStatus.CONFIRMED)

    def test_cannot_modify_confirmed_purchase(self):
        confirm_response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)

        update_response = self.client.patch(
            f"/api/inventory/purchases/{self.purchase.id}/",
            {
                "notes": "No debe cambiar",
            },
            format="json",
        )

        self.assertEqual(
            update_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.purchase.refresh_from_db()

        self.assertNotEqual(self.purchase.notes, "No debe cambiar")

    def test_cannot_modify_item_from_confirmed_purchase(self):
        confirm_response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/confirm/",
            {},
            format="json",
        )

        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)

        update_response = self.client.patch(
            f"/api/inventory/purchase-items/{self.purchase_item.id}/",
            {
                "quantity": 10,
            },
            format="json",
        )

        self.assertEqual(
            update_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.purchase_item.refresh_from_db()

        self.assertEqual(self.purchase_item.quantity, 5)

    def test_calculate_purchase_costs_creates_cost_history(self):
        category = ImportCostCategory.objects.create(
            name="FLETE",
            created_by=self.user,
            updated_by=self.user,
        )

        ImportCost.objects.create(
            purchase=self.purchase,
            category=category,
            amount=Decimal("100.0000"),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/calculate-costs/",
            {
                "margin_percentage": "30.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(ProductCostHistory.objects.count(), 1)

        history = ProductCostHistory.objects.get()

        self.assertEqual(history.product, self.product)
        self.assertEqual(history.purchase, self.purchase)
        self.assertEqual(history.original_unit_cost, Decimal("100.0000"))
        self.assertEqual(history.cost_factor, Decimal("1.2"))
        self.assertEqual(history.final_unit_cost, Decimal("120.0000"))
        self.assertEqual(history.suggested_price, Decimal("156.0000"))
        self.assertEqual(history.margin_percentage, Decimal("30.0000"))
        self.assertEqual(history.created_by, self.user)
        self.assertEqual(history.updated_by, self.user)

        item = response.data[0]

        self.assertEqual(item["product"], self.product.id)
        self.assertEqual(item["purchase"], self.purchase.id)
        self.assertEqual(item["product_detail"]["standard_code"], "P-001")
        self.assertEqual(
            item["purchase_detail"]["invoice_number"],
            "FAC-001",
        )

    def test_calculate_purchase_costs_creates_new_history_each_time(self):
        first_response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/calculate-costs/",
            {
                "margin_percentage": "20.0000",
            },
            format="json",
        )

        second_response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/calculate-costs/",
            {
                "margin_percentage": "30.0000",
            },
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(ProductCostHistory.objects.count(), 2)

    def test_calculate_purchase_costs_requires_valid_margin(self):
        response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/calculate-costs/",
            {
                "margin_percentage": "-1.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ProductCostHistory.objects.count(), 0)

    def test_calculate_purchase_costs_without_items_returns_400(self):
        purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-999",
            purchase_date=date.today(),
            currency="CRC",
            exchange_rate=Decimal("1.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            f"/api/inventory/purchases/{purchase.id}/calculate-costs/",
            {
                "margin_percentage": "30.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ProductCostHistory.objects.count(), 0)