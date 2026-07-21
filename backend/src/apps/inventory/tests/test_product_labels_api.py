from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY
from apps.inventory.models import (
    Product,
    StorageLocation,
)
from apps.inventory.services.product_labels import (
    MAX_LABELS_PER_DOCUMENT,
)


User = get_user_model()


class ProductLabelsApiTest(APITestCase):
    endpoint = "/api/inventory/products/labels/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="labels-admin",
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
            standard_code="INY-001",
            name="Inyector de prueba",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_generate_product_labels_pdf(self):
        response = self.client.post(
            self.endpoint,
            {
                "product_ids": [self.product.id],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            response["Content-Type"],
            "application/pdf",
        )

        self.assertIn(
            "attachment;",
            response["Content-Disposition"],
        )

        self.assertIn(
            "etiquetas-productos.pdf",
            response["Content-Disposition"],
        )

        pdf_content = b"".join(
            response.streaming_content,
        )

        self.assertTrue(
            pdf_content.startswith(b"%PDF"),
        )

    def test_product_ids_is_required(self):
        response = self.client.post(
            self.endpoint,
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertIn(
            "product_ids",
            response.data,
        )

    def test_product_ids_cannot_be_empty(self):
        response = self.client.post(
            self.endpoint,
            {
                "product_ids": [],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_product_ids_must_be_positive_integers(self):
        invalid_values = [
            "1",
            0,
            -1,
            True,
            None,
        ]

        for invalid_value in invalid_values:
            with self.subTest(
                invalid_value=invalid_value,
            ):
                response = self.client.post(
                    self.endpoint,
                    {
                        "product_ids": [
                            invalid_value,
                        ],
                    },
                    format="json",
                )

                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )

    def test_nonexistent_product_returns_400(self):
        response = self.client.post(
            self.endpoint,
            {
                "product_ids": [
                    self.product.id,
                    999999,
                ],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertIn(
            "999999",
            response.data["product_ids"][0],
        )

    def test_duplicate_ids_generate_only_one_label(self):
        response = self.client.post(
            self.endpoint,
            {
                "product_ids": [
                    self.product.id,
                    self.product.id,
                ],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        pdf_content = b"".join(
            response.streaming_content,
        )

        self.assertTrue(
            pdf_content.startswith(b"%PDF"),
        )

    def test_label_limit_is_validated(self):
        response = self.client.post(
            self.endpoint,
            {
                "product_ids": list(
                    range(
                        1,
                        MAX_LABELS_PER_DOCUMENT + 2,
                    )
                ),
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertIn(
            str(MAX_LABELS_PER_DOCUMENT),
            response.data["product_ids"][0],
        )

    def test_endpoint_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.post(
            self.endpoint,
            {
                "product_ids": [
                    self.product.id,
                ],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
