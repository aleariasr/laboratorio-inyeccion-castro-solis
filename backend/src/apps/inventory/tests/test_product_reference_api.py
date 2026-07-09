from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY

from apps.inventory.models import (
    Product,
    ProductReference,
    StorageLocation,
)

User = get_user_model()


class ProductReferenceApiTest(APITestCase):
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

        self.reference = ProductReference.objects.create(
            product=self.product,
            manufacturer="Bosch",
            reference_code="ABC-123",
            description="Referencia Bosch",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_product_references(self):
        response = self.client.get(
            "/api/inventory/product-references/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

        self.assertEqual(item["product"], self.product.id)
        self.assertEqual(item["manufacturer"], "Bosch")
        self.assertEqual(item["reference_code"], "ABC-123")
        self.assertEqual(
            item["product_detail"]["standard_code"],
            "P-001",
        )

    def test_filter_product_references_by_product(self):
        other_product = Product.objects.create(
            standard_code="P-002",
            name="Otro producto",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        ProductReference.objects.create(
            product=other_product,
            manufacturer="Denso",
            reference_code="D-999",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/product-references/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["reference_code"],
            "ABC-123",
        )

    def test_create_product_reference(self):
        response = self.client.post(
            "/api/inventory/product-references/",
            {
                "product": self.product.id,
                "manufacturer": "Denso",
                "reference_code": "xyz-789",
                "description": "Referencia Denso",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        reference = ProductReference.objects.get(
            id=response.data["id"],
        )

        self.assertEqual(reference.product, self.product)
        self.assertEqual(reference.manufacturer, "Denso")
        self.assertEqual(reference.reference_code, "XYZ-789")
        self.assertEqual(reference.description, "Referencia Denso")
        self.assertEqual(reference.created_by, self.user)
        self.assertEqual(reference.updated_by, self.user)

    def test_duplicate_product_reference_returns_400(self):
        response = self.client.post(
            "/api/inventory/product-references/",
            {
                "product": self.product.id,
                "manufacturer": "Bosch",
                "reference_code": "ABC-123",
                "description": "Duplicado",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(
            ProductReference.objects.filter(
                product=self.product,
                manufacturer="Bosch",
                reference_code="ABC-123",
            ).count(),
            1,
        )

    def test_update_product_reference(self):
        response = self.client.patch(
            f"/api/inventory/product-references/{self.reference.id}/",
            {
                "reference_code": "new-001",
                "description": "Actualizada",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.reference.refresh_from_db()

        self.assertEqual(self.reference.reference_code, "NEW-001")
        self.assertEqual(self.reference.description, "Actualizada")
        self.assertEqual(self.reference.updated_by, self.user)