from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY

from apps.inventory.models import (
    InventoryCount,
    InventoryCountItem,
    InventoryCountStatus,
    Product,
    StorageLocation,
)

User = get_user_model()


class InventoryCountApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        inventory_group, _ = Group.objects.get_or_create(
            name=ROLE_INVENTORY,
        )
        self.user.groups.add(inventory_group)

        self.client.force_authenticate(self.user)

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
            reference="CNT-001",
            count_date=date.today(),
            notes="Conteo inicial",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_inventory_counts(self):
        response = self.client.get(
            "/api/inventory/inventory-counts/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

        self.assertEqual(item["reference"], "CNT-001")
        self.assertEqual(item["status"], InventoryCountStatus.DRAFT)

    def test_create_inventory_count(self):
        response = self.client.post(
            "/api/inventory/inventory-counts/",
            {
                "reference": "cnt-002",
                "count_date": date.today().isoformat(),
                "notes": "Conteo nuevo",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        inventory_count = InventoryCount.objects.get(
            id=response.data["id"],
        )

        self.assertEqual(inventory_count.reference, "CNT-002")
        self.assertEqual(
            inventory_count.status,
            InventoryCountStatus.DRAFT,
        )
        self.assertEqual(inventory_count.created_by, self.user)
        self.assertEqual(inventory_count.updated_by, self.user)

    def test_duplicate_inventory_count_reference_returns_400(self):
        response = self.client.post(
            "/api/inventory/inventory-counts/",
            {
                "reference": "cnt-001",
                "count_date": date.today().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(
            InventoryCount.objects.filter(reference="CNT-001").count(),
            1,
        )

    def test_update_inventory_count(self):
        response = self.client.patch(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/",
            {
                "notes": "Notas actualizadas",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.inventory_count.refresh_from_db()

        self.assertEqual(
            self.inventory_count.notes,
            "Notas actualizadas",
        )
        self.assertEqual(self.inventory_count.updated_by, self.user)

    def test_cannot_update_approved_inventory_count(self):
        self.inventory_count.status = InventoryCountStatus.APPROVED
        self.inventory_count.save(update_fields=["status"])

        response = self.client.patch(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/",
            {
                "notes": "No debería cambiar",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.inventory_count.refresh_from_db()

        self.assertNotEqual(
            self.inventory_count.notes,
            "No debería cambiar",
        )

    def test_create_inventory_count_item(self):
        response = self.client.post(
            "/api/inventory/inventory-count-items/",
            {
                "inventory_count": self.inventory_count.id,
                "product": self.product.id,
                "counted_quantity": 10,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        item = InventoryCountItem.objects.get(
            id=response.data["id"],
        )

        self.assertEqual(item.inventory_count, self.inventory_count)
        self.assertEqual(item.product, self.product)
        self.assertEqual(item.counted_quantity, 10)
        self.assertEqual(item.created_by, self.user)
        self.assertEqual(item.updated_by, self.user)

    def test_list_inventory_count_items(self):
        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=8,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/inventory-count-items/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

        self.assertEqual(item["inventory_count"], self.inventory_count.id)
        self.assertEqual(item["product"], self.product.id)
        self.assertEqual(item["counted_quantity"], 8)
        self.assertEqual(
            item["product_detail"]["standard_code"],
            "P-001",
        )

    def test_filter_inventory_count_items_by_count(self):
        other_count = InventoryCount.objects.create(
            reference="CNT-002",
            count_date=date.today(),
            created_by=self.user,
            updated_by=self.user,
        )

        other_product = Product.objects.create(
            standard_code="P-002",
            name="Otro producto",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=8,
            created_by=self.user,
            updated_by=self.user,
        )

        InventoryCountItem.objects.create(
            inventory_count=other_count,
            product=other_product,
            counted_quantity=4,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/inventory-count-items/",
            {
                "inventory_count": self.inventory_count.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["inventory_count"],
            self.inventory_count.id,
        )

    def test_duplicate_inventory_count_item_returns_400(self):
        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=8,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            "/api/inventory/inventory-count-items/",
            {
                "inventory_count": self.inventory_count.id,
                "product": self.product.id,
                "counted_quantity": 9,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(
            InventoryCountItem.objects.filter(
                inventory_count=self.inventory_count,
                product=self.product,
            ).count(),
            1,
        )

    def test_cannot_create_item_for_approved_inventory_count(self):
        self.inventory_count.status = InventoryCountStatus.APPROVED
        self.inventory_count.save(update_fields=["status"])

        response = self.client.post(
            "/api/inventory/inventory-count-items/",
            {
                "inventory_count": self.inventory_count.id,
                "product": self.product.id,
                "counted_quantity": 10,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_update_item_for_cancelled_inventory_count(self):
        item = InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=8,
            created_by=self.user,
            updated_by=self.user,
        )

        self.inventory_count.status = InventoryCountStatus.CANCELLED
        self.inventory_count.save(update_fields=["status"])

        response = self.client.patch(
            f"/api/inventory/inventory-count-items/{item.id}/",
            {
                "counted_quantity": 12,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        item.refresh_from_db()

        self.assertEqual(item.counted_quantity, 8)

    def test_approve_inventory_count_with_positive_adjustment(self):
        from apps.inventory.selectors import current_stock
        from apps.inventory.services import initial_inventory

        initial_inventory(
            product=self.product,
            quantity=5,
            user=self.user,
        )

        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=8,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.inventory_count.refresh_from_db()

        self.assertEqual(
            self.inventory_count.status,
            InventoryCountStatus.APPROVED,
        )
        self.assertEqual(self.inventory_count.updated_by, self.user)
        self.assertEqual(current_stock(self.product), 8)

    def test_approve_inventory_count_with_negative_adjustment(self):
        from apps.inventory.models import MovementDirection, StockMovement
        from apps.inventory.selectors import current_stock
        from apps.inventory.services import initial_inventory

        initial_inventory(
            product=self.product,
            quantity=10,
            user=self.user,
        )

        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=6,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(current_stock(self.product), 6)

        movement = (
            StockMovement.objects
            .filter(product=self.product)
            .order_by("-id")
            .first()
        )

        self.assertEqual(movement.direction, MovementDirection.OUT)
        self.assertEqual(movement.quantity, 4)
        self.assertEqual(
            movement.notes,
            f"Conteo físico {self.inventory_count.reference}",
        )

    def test_approve_inventory_count_without_difference_creates_no_adjustment(self):
        from apps.inventory.models import StockMovement
        from apps.inventory.selectors import current_stock
        from apps.inventory.services import initial_inventory

        initial_inventory(
            product=self.product,
            quantity=10,
            user=self.user,
        )

        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=10,
            created_by=self.user,
            updated_by=self.user,
        )

        movements_before = StockMovement.objects.count()

        response = self.client.post(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(current_stock(self.product), 10)
        self.assertEqual(
            StockMovement.objects.count(),
            movements_before,
        )

    def test_cannot_approve_inventory_count_twice(self):
        InventoryCountItem.objects.create(
            inventory_count=self.inventory_count,
            product=self.product,
            counted_quantity=10,
            created_by=self.user,
            updated_by=self.user,
        )

        first_response = self.client.post(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/approve/",
            {},
            format="json",
        )

        second_response = self.client.post(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            second_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_cannot_approve_cancelled_inventory_count(self):
        self.inventory_count.status = InventoryCountStatus.CANCELLED
        self.inventory_count.save(update_fields=["status"])

        response = self.client.post(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.inventory_count.refresh_from_db()

        self.assertEqual(
            self.inventory_count.status,
            InventoryCountStatus.CANCELLED,
        )