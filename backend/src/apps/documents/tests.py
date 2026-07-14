from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY
from apps.inventory.models import Product, StorageLocation

User = get_user_model()


class ProductLabelsPdfApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="documents-user",
            password="12345678",
        )

        inventory_group, _ = Group.objects.get_or_create(
            name=ROLE_INVENTORY,
        )
        self.user.groups.add(inventory_group)

        self.location = StorageLocation.objects.create(
            code="D400",
            description="Estante D",
            created_by=self.user,
            updated_by=self.user,
        )

        self.product = Product.objects.create(
            standard_code="DOC-001",
            name="Producto etiqueta",
            description="Descripción para etiqueta",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_product_labels_requires_authentication(self):
        response = self.client.get(
            "/api/documents/product-labels/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_product_labels_requires_product(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(
            "/api/documents/product-labels/",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_product_labels_returns_pdf(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(
            "/api/documents/product-labels/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(
            "product-labels.pdf",
            response["Content-Disposition"],
        )

        content = b"".join(response.streaming_content)

        self.assertTrue(content.startswith(b"%PDF"))
        self.assertGreater(len(content), 1000)

    def test_product_labels_returns_404_when_product_does_not_exist(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(
            "/api/documents/product-labels/",
            {
                "product": 999999,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)