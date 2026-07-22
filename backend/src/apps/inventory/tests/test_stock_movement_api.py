from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY
from apps.inventory.models import (
    MovementDirection,
    Product,
    StockMovement,
    StockMovementType,
    StorageLocation,
)


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

    def test_list_requires_product_filter(self):
        response = self.client.get(
            "/api/inventory/stock-movements/"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn(
            "product",
            response.data,
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
            result["purchase_invoice_number"],
        )
        self.assertIsNone(
            result["sale_id"],
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
