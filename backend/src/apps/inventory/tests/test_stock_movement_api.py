from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY
from apps.inventory.models import (
    InventoryCount,
    InventoryCountItem,
    MovementDirection,
    Product,
    Purchase,
    PurchaseItem,
    StockMovement,
    StockMovementType,
    StorageLocation,
    Supplier,
    SupplierProduct,
)
from apps.inventory.services import (
    approve_inventory_count,
    confirm_purchase,
    initial_inventory,
)
from apps.sales.models import Sale, SaleItem
from apps.sales.services import confirm_sale


User = get_user_model()


class StockMovementApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="inventory-user",
            password="12345678",
        )

        inventory_group, _ = (
            Group.objects.get_or_create(
                name=ROLE_INVENTORY,
            )
        )
        self.user.groups.add(inventory_group)

        self.client.force_authenticate(
            self.user,
        )

        self.location = (
            StorageLocation.objects.create(
                code="A101",
                created_by=self.user,
                updated_by=self.user,
            )
        )

        self.product = Product.objects.create(
            standard_code="P-001",
            name="Producto de prueba",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

    def create_movement(
        self,
        *,
        movement_type=(
            StockMovementType.ADJUSTMENT
        ),
        direction=MovementDirection.IN,
        quantity=1,
        notes="Movimiento de prueba.",
    ):
        return StockMovement.create_from_service(
            product=self.product,
            movement_type=movement_type,
            direction=direction,
            quantity=quantity,
            notes=notes,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_without_product_filter_returns_all_movements(
        self,
    ):
        other_product = Product.objects.create(
            standard_code="P-002",
            name="Otro producto",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        self.create_movement(quantity=5)

        StockMovement.create_from_service(
            product=other_product,
            movement_type=StockMovementType.ADJUSTMENT,
            direction=MovementDirection.IN,
            quantity=9,
            notes="Otro producto.",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/stock-movements/"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            2,
        )

    def test_invalid_product_filter_returns_400(
        self,
    ):
        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "product": "invalid",
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn(
            "product",
            response.data,
        )

    def test_list_movements_for_product(self):
        movement = self.create_movement(
            movement_type=(
                StockMovementType.INITIAL
            ),
            direction=MovementDirection.IN,
            quantity=12,
            notes="Inventario inicial.",
        )

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            1,
        )

        result = response.data["results"][0]

        self.assertEqual(
            result["id"],
            movement.id,
        )
        self.assertEqual(
            result["product"],
            self.product.id,
        )
        self.assertEqual(
            result["movement_type"],
            StockMovementType.INITIAL,
        )
        self.assertEqual(
            result["movement_type_display"],
            "Inventario inicial",
        )
        self.assertEqual(
            result["direction"],
            MovementDirection.IN,
        )
        self.assertEqual(
            result["direction_display"],
            "Entrada",
        )
        self.assertEqual(
            result["quantity"],
            12,
        )
        self.assertEqual(
            result["notes"],
            "Inventario inicial.",
        )
        self.assertEqual(
            result["created_by_username"],
            self.user.username,
        )
        self.assertIsNone(
            result["purchase_id"],
        )
        self.assertIsNone(
            result["purchase_invoice_number"],
        )
        self.assertIsNone(
            result["sale_id"],
        )
        self.assertIsNone(
            result["inventory_count"],
        )
        self.assertIsNone(
            result["inventory_count_reference"],
        )

    def test_list_only_returns_requested_product(
        self,
    ):
        other_product = Product.objects.create(
            standard_code="P-002",
            name="Otro producto",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        requested_movement = (
            self.create_movement(
                quantity=5,
            )
        )

        StockMovement.create_from_service(
            product=other_product,
            movement_type=(
                StockMovementType.ADJUSTMENT
            ),
            direction=MovementDirection.IN,
            quantity=20,
            notes="Movimiento de otro producto.",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            1,
        )
        self.assertEqual(
            response.data["results"][0]["id"],
            requested_movement.id,
        )

    def test_filter_movements_by_location(self):
        other_location = StorageLocation.objects.create(
            code="B202",
            created_by=self.user,
            updated_by=self.user,
        )

        other_product = Product.objects.create(
            standard_code="P-003",
            name="Producto otra ubicación",
            storage_location=other_location,
            created_by=self.user,
            updated_by=self.user,
        )

        movement = self.create_movement(quantity=5)

        StockMovement.create_from_service(
            product=other_product,
            movement_type=StockMovementType.ADJUSTMENT,
            direction=MovementDirection.IN,
            quantity=7,
            notes="Otra ubicación.",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "location": self.location.id,
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            1,
        )
        self.assertEqual(
            response.data["results"][0]["id"],
            movement.id,
        )

    def test_filter_movements_by_type_and_direction(self):
        entry = self.create_movement(
            movement_type=StockMovementType.INITIAL,
            direction=MovementDirection.IN,
            quantity=10,
        )

        self.create_movement(
            movement_type=StockMovementType.ADJUSTMENT,
            direction=MovementDirection.OUT,
            quantity=2,
        )

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "movement_type": "initial",
                "direction": "in",
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            1,
        )
        self.assertEqual(
            response.data["results"][0]["id"],
            entry.id,
        )

    def test_filter_movements_by_date_range(self):
        old_movement = self.create_movement(quantity=3)

        StockMovement.objects.filter(
            id=old_movement.id,
        ).update(
            created_at=timezone.now() - timedelta(days=10),
        )

        recent_movement = self.create_movement(quantity=4)

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "date_from": (
                    timezone.now() - timedelta(days=1)
                ).date().isoformat(),
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            1,
        )
        self.assertEqual(
            response.data["results"][0]["id"],
            recent_movement.id,
        )

    def test_date_range_validates_order(self):
        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "date_from": "2026-02-01",
                "date_to": "2026-01-01",
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn(
            "date_to",
            response.data,
        )

    def test_filter_movements_by_purchase(self):
        supplier = Supplier.objects.create(
            name="Proveedor",
            created_by=self.user,
            updated_by=self.user,
        )

        supplier_product = SupplierProduct.objects.create(
            supplier=supplier,
            product=self.product,
            created_by=self.user,
            updated_by=self.user,
        )

        purchase = Purchase.objects.create(
            supplier=supplier,
            invoice_number="FAC-001",
            purchase_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=purchase,
            supplier_product=supplier_product,
            quantity=5,
            unit_cost=100,
            created_by=self.user,
            updated_by=self.user,
        )

        confirm_purchase(
            purchase=purchase,
            user=self.user,
        )

        self.create_movement(quantity=1)

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "purchase": purchase.id,
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            1,
        )

        result = response.data["results"][0]

        self.assertEqual(
            result["purchase_id"],
            purchase.id,
        )
        self.assertEqual(
            result["purchase_invoice_number"],
            "FAC-001",
        )

    def test_filter_movements_by_sale(self):
        initial_inventory(
            product=self.product,
            quantity=10,
            user=self.user,
        )

        sale = Sale.objects.create(
            sale_date=date.today(),
            currency="CRC",
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=sale,
            product=self.product,
            quantity=3,
            unit_price=100,
            created_by=self.user,
            updated_by=self.user,
        )

        confirm_sale(
            sale=sale,
            user=self.user,
        )

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "sale": sale.id,
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            1,
        )
        self.assertEqual(
            response.data["results"][0]["sale_id"],
            sale.id,
        )

    def test_filter_movements_by_inventory_count(self):
        inventory_count = InventoryCount.objects.create(
            reference="INV-0001",
            count_date=date.today(),
            created_by=self.user,
            updated_by=self.user,
        )

        InventoryCountItem.objects.create(
            inventory_count=inventory_count,
            product=self.product,
            counted_quantity=8,
            created_by=self.user,
            updated_by=self.user,
        )

        approve_inventory_count(
            inventory_count=inventory_count,
            user=self.user,
        )

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "inventory_count": inventory_count.id,
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            1,
        )

        result = response.data["results"][0]

        self.assertEqual(
            result["inventory_count"],
            inventory_count.id,
        )
        self.assertEqual(
            result["inventory_count_reference"],
            "INV-0001",
        )

    def test_movements_are_ordered_newest_first(
        self,
    ):
        first_movement = self.create_movement(
            direction=MovementDirection.IN,
            quantity=8,
            notes="Primer movimiento.",
        )

        second_movement = self.create_movement(
            direction=MovementDirection.OUT,
            quantity=3,
            notes="Segundo movimiento.",
        )

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            [
                result["id"]
                for result
                in response.data["results"]
            ],
            [
                second_movement.id,
                first_movement.id,
            ],
        )

    def test_ordering_can_be_reversed(self):
        first_movement = self.create_movement(
            direction=MovementDirection.IN,
            quantity=8,
            notes="Primer movimiento.",
        )

        second_movement = self.create_movement(
            direction=MovementDirection.OUT,
            quantity=3,
            notes="Segundo movimiento.",
        )

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "product": self.product.id,
                "ordering": "created_at",
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            [
                result["id"]
                for result
                in response.data["results"]
            ],
            [
                first_movement.id,
                second_movement.id,
            ],
        )

    def test_endpoint_is_paginated(self):
        for index in range(55):
            self.create_movement(
                quantity=index + 1,
                notes=(
                    f"Movimiento número {index + 1}."
                ),
            )

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            set(response.data.keys()),
            {
                "count",
                "next",
                "previous",
                "results",
            },
        )
        self.assertEqual(
            response.data["count"],
            55,
        )
        self.assertEqual(
            len(response.data["results"]),
            50,
        )
        self.assertIsNotNone(
            response.data["next"],
        )

    def test_custom_page_size_is_supported(self):
        for index in range(15):
            self.create_movement(
                quantity=index + 1,
            )

        response = self.client.get(
            "/api/inventory/stock-movements/",
            {
                "product": self.product.id,
                "page_size": 10,
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["count"],
            15,
        )
        self.assertEqual(
            len(response.data["results"]),
            10,
        )

    def test_endpoint_does_not_allow_creation(self):
        response = self.client.post(
            "/api/inventory/stock-movements/",
            {
                "product": self.product.id,
                "movement_type": (
                    StockMovementType.ADJUSTMENT
                ),
                "direction": (
                    MovementDirection.IN
                ),
                "quantity": 100,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertFalse(
            StockMovement.objects.filter(
                product=self.product,
                quantity=100,
            ).exists()
        )

    def test_endpoint_does_not_allow_update(self):
        movement = self.create_movement(
            quantity=4,
        )

        response = self.client.patch(
            (
                "/api/inventory/"
                f"stock-movements/{movement.id}/"
            ),
            {
                "quantity": 999,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

        movement.refresh_from_db()

        self.assertEqual(
            movement.quantity,
            4,
        )
