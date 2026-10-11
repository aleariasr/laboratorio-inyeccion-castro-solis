from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_ADMIN,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
)
from apps.inventory.models import Product, StorageLocation
from apps.inventory.services import initial_inventory

User = get_user_model()


class MovementsPermissionApiTest(APITestCase):
    """
    Movimientos de inventario es un módulo de solo lectura: en
    ModulePermissions solo existe view_movements (ver
    apps/core/models.py), no hay add_/change_/cancel_. Los movimientos
    se generan como efecto secundario de otras acciones (confirmar
    compra, aprobar conteo, etc.), nunca directamente vía este
    endpoint.
    """

    def setUp(self):
        call_command("setup_roles")

        self.inventory_user = User.objects.create_user(
            username="movements-inventory",
            password="12345678",
        )
        self.inventory_user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        self.read_only_user = User.objects.create_user(
            username="movements-readonly",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="movements-plain",
            password="12345678",
        )

        self.admin_user = User.objects.create_user(
            username="movements-admin",
            password="12345678",
        )
        self.admin_user.groups.add(
            Group.objects.get(name=ROLE_ADMIN),
        )

        # Desde el punto 6, view_movements no está en ningún rol: la
        # pantalla se entra solo desde Reportes (ADMIN). Se puede dar
        # suelto a una persona, y este usuario representa ese caso.
        self.movements_reader = User.objects.create_user(
            username="movements-reader",
            password="12345678",
        )
        self.movements_reader.user_permissions.add(
            Permission.objects.get(
                content_type__app_label="core",
                content_type__model="modulepermissions",
                codename="view_movements",
            ),
        )

        self.location = StorageLocation.objects.create(
            code="A101",
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        self.product = Product.objects.create(
            standard_code="MOV-001",
            name="Producto con movimientos",
            storage_location=self.location,
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        initial_inventory(
            product=self.product,
            quantity=5,
            user=self.inventory_user,
        )

    def test_admin_user_can_list_movements(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get("/api/inventory/stock-movements/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_user_with_view_movements_permission_can_list(self):
        self.client.force_authenticate(self.movements_reader)

        response = self.client.get("/api/inventory/stock-movements/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_inventory_role_can_no_longer_list_movements(self):
        # view_movements salió de ROLE_PERMISSIONS (punto 6).
        self.client.force_authenticate(self.inventory_user)

        response = self.client.get("/api/inventory/stock-movements/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_read_only_role_can_no_longer_list_movements(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/inventory/stock-movements/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_movements(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/inventory/stock-movements/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_movements(self):
        response = self.client.get("/api/inventory/stock-movements/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_movements_reader_cannot_create_movement_directly(self):
        """
        Ni siquiera quien puede leer movimientos puede crearlos a mano:
        no existe add_movements en ModulePermissions, así que
        MovementsPermission siempre resuelve a un codename que nadie
        (fuera de ADMIN/superuser) puede tener.
        """
        self.client.force_authenticate(self.movements_reader)

        response = self.client.post(
            "/api/inventory/stock-movements/",
            {
                "product": self.product.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_movements_reader_cannot_update_movement_directly(self):
        self.client.force_authenticate(self.movements_reader)

        movement_id = self.client.get(
            "/api/inventory/stock-movements/"
        ).data["results"][0]["id"]

        response = self.client.patch(
            f"/api/inventory/stock-movements/{movement_id}/",
            {"notes": "Intento de edición"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
