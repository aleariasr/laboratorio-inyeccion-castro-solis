from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY

from apps.inventory.models import Product, StorageLocation

User = get_user_model()


class ProductApiTest(APITestCase):
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
            name="Producto",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_products(self):
        response = self.client.get("/api/inventory/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_retrieve_product(self):
        response = self.client.get(
            f"/api/inventory/products/{self.product.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["standard_code"],
            "P-001",
        )

    def test_create_product(self):
        response = self.client.post(
            "/api/inventory/products/",
            {
                "standard_code": "P-002",
                "name": "Nuevo",
                "storage_location": self.location.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        self.assertTrue(
            Product.objects.filter(
                standard_code="P-002",
            ).exists()
        )

    def test_update_product(self):
        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {
                "name": "Producto actualizado",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.product.refresh_from_db()

        self.assertEqual(
            self.product.name,
            "Producto actualizado",
        )