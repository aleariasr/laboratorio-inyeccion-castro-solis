from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN
from apps.inventory.models import (
    MovementDirection,
    Product,
    StockMovement,
    StockMovementType,
    StorageLocation,
)

User = get_user_model()


class ProductOrderingApiTest(APITestCase):
    """Punto 2 del plan del 2026-10-22: `?ordering=` en la lista de productos."""

    endpoint = "/api/inventory/products/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="ordering-admin",
            password="12345678",
        )

        call_command("setup_roles")

        self.user.groups.add(Group.objects.get(name=ROLE_ADMIN))
        self.client.force_authenticate(self.user)

        self.location_a10 = self._location("A10")
        self.location_a2 = self._location("A2")

        # Creados en este orden: el registro y la modificación van al revés
        # del código (ver más abajo).
        self.product_a10 = self._product(
            "A10", name="Bomba", description="Ccc", location=self.location_a2,
        )
        self.product_a2 = self._product(
            "A2", name="álabe", description="Bbb", location=self.location_a10,
        )
        self.product_b1 = self._product(
            "B1", name="Cable", description="Aaa", location=self.location_a2,
        )

        now = timezone.now()

        for days, product in enumerate(
            [self.product_a10, self.product_a2, self.product_b1],
        ):
            Product.objects.filter(pk=product.pk).update(
                created_at=now - timedelta(days=10 - days),
                updated_at=now - timedelta(days=days),
            )

        self._stock(self.product_a10, 5)
        self._stock(self.product_a2, 9)
        self._stock(self.product_b1, 1)

    def _location(self, code):
        return StorageLocation.objects.create(
            code=code,
            created_by=self.user,
            updated_by=self.user,
        )

    def _product(self, code, *, name, description, location):
        return Product.objects.create(
            standard_code=code,
            name=name,
            description=description,
            storage_location=location,
            created_by=self.user,
            updated_by=self.user,
        )

    def _stock(self, product, quantity):
        StockMovement.create_from_service(
            product=product,
            movement_type=StockMovementType.INITIAL,
            direction=MovementDirection.IN,
            quantity=quantity,
            notes="Inventario inicial de prueba.",
            created_by=self.user,
            updated_by=self.user,
        )

    def _codes(self, ordering, **params):
        response = self.client.get(
            self.endpoint,
            {"ordering": ordering, **params},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        return [product["standard_code"] for product in response.data["results"]]

    def test_code_is_ordered_naturally(self):
        self.assertEqual(self._codes("standard_code"), ["A2", "A10", "B1"])
        self.assertEqual(self._codes("-standard_code"), ["B1", "A10", "A2"])

    def test_name_ignores_accents_and_case(self):
        # "álabe" va con la a, antes que "Bomba" y "Cable".
        self.assertEqual(self._codes("name"), ["A2", "A10", "B1"])
        self.assertEqual(self._codes("-name"), ["B1", "A10", "A2"])

    def test_description(self):
        self.assertEqual(self._codes("description"), ["B1", "A2", "A10"])
        self.assertEqual(self._codes("-description"), ["A10", "A2", "B1"])

    def test_location_is_ordered_naturally_with_code_as_tiebreaker(self):
        # A2 (A10 y B1) antes que A10 (A2); dentro de A2, por código.
        self.assertEqual(self._codes("location"), ["A10", "B1", "A2"])
        self.assertEqual(self._codes("-location"), ["A2", "A10", "B1"])

    def test_current_stock(self):
        self.assertEqual(self._codes("current_stock"), ["B1", "A10", "A2"])
        self.assertEqual(self._codes("-current_stock"), ["A2", "A10", "B1"])

    def test_created_at(self):
        self.assertEqual(self._codes("created_at"), ["A10", "A2", "B1"])
        self.assertEqual(self._codes("-created_at"), ["B1", "A2", "A10"])

    def test_updated_at(self):
        self.assertEqual(self._codes("updated_at"), ["B1", "A2", "A10"])
        self.assertEqual(self._codes("-updated_at"), ["A10", "A2", "B1"])

    def test_variants_with_the_same_code_keep_a_stable_order(self):
        variant = self._product(
            "A2", name="álabe genérico", description="", location=self.location_a2,
        )

        response = self.client.get(self.endpoint, {"ordering": "standard_code"})

        ids = [product["id"] for product in response.data["results"]]

        self.assertEqual(ids[:2], [self.product_a2.id, variant.id])

    def test_search_keeps_exact_code_match_first(self):
        self._product(
            "XA2", name="Otro", description="", location=self.location_a2,
        )

        # Todos coinciden ("A2" está en el código o en la ubicación); el
        # código exacto va primero y el resto sigue el orden pedido.
        self.assertEqual(
            self._codes("-standard_code", q="A2"),
            ["A2", "XA2", "B1", "A10"],
        )

    def test_without_ordering_keeps_the_previous_default(self):
        response = self.client.get(self.endpoint)

        codes = [product["standard_code"] for product in response.data["results"]]

        # Orden de siempre (código, sin orden natural): lo usan los buscadores.
        self.assertEqual(codes, ["A10", "A2", "B1"])

    def test_invalid_ordering_returns_400(self):
        for ordering in ["price", "-", "--name", "storage_location__code"]:
            with self.subTest(ordering=ordering):
                response = self.client.get(self.endpoint, {"ordering": ordering})

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("ordering", response.data)
