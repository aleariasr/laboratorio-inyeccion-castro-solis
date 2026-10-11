from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_ADMIN,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
)
from apps.inventory.models import Supplier

User = get_user_model()


class SuppliersPermissionApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.admin_user = User.objects.create_user(
            username="suppliers-admin",
            password="12345678",
        )
        self.admin_user.groups.add(
            Group.objects.get(name=ROLE_ADMIN),
        )

        self.read_only_user = User.objects.create_user(
            username="suppliers-readonly",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="suppliers-plain",
            password="12345678",
        )

        self.supplier = Supplier.objects.create(
            name="Proveedor de prueba",
            created_by=self.admin_user,
            updated_by=self.admin_user,
        )

    def test_admin_user_can_create_supplier(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.post(
            "/api/inventory/suppliers/",
            {"name": "Nuevo proveedor"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_admin_user_can_update_supplier(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.patch(
            f"/api/inventory/suppliers/{self.supplier.id}/",
            {"contact_name": "Contacto actualizado"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_can_list_suppliers(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/inventory/suppliers/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_supplier(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/inventory/suppliers/",
            {"name": "Proveedor rechazado"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_read_only_user_cannot_update_supplier(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.patch(
            f"/api/inventory/suppliers/{self.supplier.id}/",
            {"contact_name": "Intento de edición"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_suppliers(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/inventory/suppliers/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_suppliers(self):
        response = self.client.get("/api/inventory/suppliers/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inventory_role_can_no_longer_see_them(self):
        """
        Desde el rediseño de roles (punto 13), Inventario no maneja
        proveedores.
        """

        inventory_user = User.objects.create_user(
            username="proveedores-inventory",
            password="12345678",
        )
        inventory_user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        self.client.force_authenticate(inventory_user)

        self.assertEqual(
            self.client.get("/api/inventory/suppliers/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
