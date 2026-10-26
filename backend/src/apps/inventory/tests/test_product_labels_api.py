from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
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

        call_command("setup_roles")

        self.user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )
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


class ProductLabelOwnCodeTest(APITestCase):
    """Punto 16: la etiqueta muestra el código propio cuando lo hay."""

    # Mismos datos, sin heredar los tests (correrían dos veces).
    endpoint = ProductLabelsApiTest.endpoint
    setUp = ProductLabelsApiTest.setUp

    def test_label_shows_own_code(self):
        from unittest import mock

        from reportlab import rl_config

        self.product.own_code = "KG-77"
        self.product.save(update_fields=["own_code"])

        # Sin comprimir, para leer el texto del PDF.
        with mock.patch.object(rl_config, "pageCompression", 0):
            response = self.client.post(
                self.endpoint,
                {"product_ids": [self.product.id]},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        text = b"".join(response.streaming_content).decode("latin-1")

        self.assertIn("digo propio: KG-77) Tj", text)
        # El código de barras lleva el código propio (su texto debajo).
        self.assertIn("(KG-77) Tj", text)

    def test_barcode_uses_own_code_or_universal(self):
        from apps.inventory.services.product_labels import (
            ProductLabel,
            label_barcode_value,
        )

        def label(own_code):
            return ProductLabel(
                product_id=1,
                standard_code="INY-001",
                product_name="Inyector",
                location_code="A101",
                own_code=own_code,
            )

        self.assertEqual(label_barcode_value(label("KG-77")), "KG-77")
        self.assertEqual(label_barcode_value(label("")), "INY-001")


class ProductLabelCopiesTest(APITestCase):
    """
    Punto 4 del plan del 2026-10-22: `items` con copias por producto, en el
    orden recibido; el tope cuenta etiquetas, no productos.
    """

    # Mismos datos, sin heredar los tests (correrían dos veces).
    endpoint = ProductLabelsApiTest.endpoint
    _base_set_up = ProductLabelsApiTest.setUp

    def setUp(self):
        self._base_set_up()

        self.other_product = Product.objects.create(
            standard_code="INY-002",
            name="Otro inyector",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

    def _labelled_ids(self, items):
        """Ids de producto de cada etiqueta, en el orden del PDF."""

        from unittest import mock

        from apps.inventory.services import product_labels

        with mock.patch(
            "apps.inventory.views.product.build_product_labels",
            wraps=product_labels.build_product_labels,
        ) as build_labels:
            response = self.client.post(
                self.endpoint,
                {"items": items},
                format="json",
            )

        # Un error trae .data; el PDF (FileResponse) no.
        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            getattr(response, "data", None),
        )
        self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF"))

        return [product.id for product in build_labels.call_args.args[0]]

    def test_copies_generate_that_many_labels_in_the_given_order(self):
        self.assertEqual(
            self._labelled_ids(
                [
                    {"product_id": self.other_product.id, "copies": 2},
                    {"product_id": self.product.id, "copies": 3},
                ],
            ),
            [self.other_product.id] * 2 + [self.product.id] * 3,
        )

    def test_repeated_product_adds_its_copies_at_its_first_position(self):
        self.assertEqual(
            self._labelled_ids(
                [
                    {"product_id": self.product.id, "copies": 1},
                    {"product_id": self.other_product.id, "copies": 1},
                    {"product_id": self.product.id, "copies": 2},
                ],
            ),
            [self.product.id] * 3 + [self.other_product.id],
        )

    def test_limit_counts_copies(self):
        response = self.client.post(
            self.endpoint,
            {
                "items": [
                    {"product_id": self.product.id, "copies": MAX_LABELS_PER_DOCUMENT},
                    {"product_id": self.other_product.id, "copies": 1},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(str(MAX_LABELS_PER_DOCUMENT), response.data["items"][0])
        self.assertIn(str(MAX_LABELS_PER_DOCUMENT + 1), response.data["items"][0])

    def test_limit_allows_exactly_the_maximum(self):
        self.assertEqual(
            len(
                self._labelled_ids(
                    [{"product_id": self.product.id, "copies": MAX_LABELS_PER_DOCUMENT}],
                ),
            ),
            MAX_LABELS_PER_DOCUMENT,
        )

    def test_invalid_items_return_400(self):
        invalid_items = [
            None,
            [],
            [self.product.id],
            [{"product_id": self.product.id}],
            [{"product_id": self.product.id, "copies": 0}],
            [{"product_id": self.product.id, "copies": "2"}],
            [{"product_id": self.product.id, "copies": True}],
            [{"product_id": True, "copies": 1}],
            [{"product_id": 999999, "copies": 1}],
        ]

        for items in invalid_items:
            with self.subTest(items=items):
                response = self.client.post(
                    self.endpoint,
                    {"items": items},
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("items", response.data)
