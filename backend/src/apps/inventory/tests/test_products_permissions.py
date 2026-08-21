from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
)
from apps.inventory.models import Product, StorageLocation

User = get_user_model()


class ProductsPermissionApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.inventory_user = User.objects.create_user(
            username="products-inventory",
            password="12345678",
        )
        self.inventory_user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        self.read_only_user = User.objects.create_user(
            username="products-readonly",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="products-plain",
            password="12345678",
        )

        self.location = StorageLocation.objects.create(
            code="A101",
            description="Ubicación A101",
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        self.product = Product.objects.create(
            standard_code="PERM-001",
            name="Producto prueba de permisos",
            storage_location=self.location,
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

    def test_inventory_user_can_create_product(self):
        self.client.force_authenticate(self.inventory_user)

        response = self.client.post(
            "/api/inventory/products/",
            {
                "standard_code": "PERM-002",
                "name": "Producto nuevo",
                "storage_location": self.location.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_inventory_user_can_update_product(self):
        self.client.force_authenticate(self.inventory_user)

        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {"name": "Producto actualizado"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_can_list_products(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/inventory/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_product(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/inventory/products/",
            {
                "standard_code": "PERM-003",
                "name": "Producto rechazado",
                "storage_location": self.location.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_read_only_user_cannot_update_product(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {"name": "Intento de edición"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_products(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/inventory/products/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_products(self):
        response = self.client.get("/api/inventory/products/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
