from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY

from apps.inventory.models import Product, StorageLocation

User = get_user_model()


class StorageLocationApiTest(APITestCase):
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
            description="Estante A",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_locations(self):
        response = self.client.get("/api/inventory/locations/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_create_location(self):
        response = self.client.post(
            "/api/inventory/locations/",
            {
                "code": "B201",
                "description": "Bodega B",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.assertTrue(
            StorageLocation.objects.filter(code="B201").exists()
        )

    def test_update_location(self):
        response = self.client.patch(
            f"/api/inventory/locations/{self.location.id}/",
            {
                "description": "Descripción actualizada",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.location.refresh_from_db()

        self.assertEqual(
            self.location.description,
            "Descripción actualizada",
        )


    def test_search_locations_by_code_or_description(self):
        StorageLocation.objects.create(
            code="B202",
            description="Bodega secundaria",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/locations/",
            {
                "q": "secundaria",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["code"],
            "B202",
        )

    def test_filter_locations_by_active_state(self):
        StorageLocation.objects.create(
            code="B202",
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/locations/",
            {
                "is_active": "false",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["code"],
            "B202",
        )

    def test_invalid_location_active_filter_returns_400(self):
        response = self.client.get(
            "/api/inventory/locations/",
            {
                "is_active": "invalid",
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("is_active", response.data)

    def test_create_location_normalizes_values_and_sets_audit_users(self):
        response = self.client.post(
            "/api/inventory/locations/",
            {
                "code": "  b203  ",
                "description": "  Bodega auxiliar  ",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        location = StorageLocation.objects.get(
            id=response.data["id"],
        )

        self.assertEqual(location.code, "B203")
        self.assertEqual(
            location.description,
            "Bodega auxiliar",
        )
        self.assertEqual(
            location.created_by,
            self.user,
        )
        self.assertEqual(
            location.updated_by,
            self.user,
        )

    def test_update_location_sets_updated_by(self):
        other_user = User.objects.create_user(
            username="other-inventory",
            password="12345678",
        )

        inventory_group = Group.objects.get(
            name=ROLE_INVENTORY,
        )
        other_user.groups.add(inventory_group)

        self.client.force_authenticate(other_user)

        response = self.client.patch(
            f"/api/inventory/locations/{self.location.id}/",
            {
                "description": "  Nueva descripción  ",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.location.refresh_from_db()

        self.assertEqual(
            self.location.description,
            "Nueva descripción",
        )
        self.assertEqual(
            self.location.updated_by,
            other_user,
        )

    def test_duplicate_normalized_location_code_returns_400(self):
        response = self.client.post(
            "/api/inventory/locations/",
            {
                "code": " a101 ",
                "description": "Duplicada",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("code", response.data)

    def test_cannot_deactivate_location_with_active_products(self):
        Product.objects.create(
            standard_code="PROD-LOCATION-001",
            name="Producto activo",
            storage_location=self.location,
            minimum_stock=0,
            unit_of_measure="unidad",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/locations/{self.location.id}/",
            {
                "is_active": False,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("is_active", response.data)

        self.location.refresh_from_db()

        self.assertTrue(self.location.is_active)


    def test_can_deactivate_location_when_all_products_are_inactive(self):
        Product.objects.create(
            standard_code="PROD-LOCATION-002",
            name="Producto inactivo",
            storage_location=self.location,
            minimum_stock=0,
            unit_of_measure="unidad",
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/locations/{self.location.id}/",
            {
                "is_active": False,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.location.refresh_from_db()

        self.assertFalse(self.location.is_active)

    def test_cannot_reactivate_product_in_inactive_location(self):
        inactive_location = StorageLocation.objects.create(
            code="Z999",
            description="Ubicación inactiva",
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        product = Product.objects.create(
            standard_code="REACTIVATE-001",
            name="Producto por reactivar",
            storage_location=inactive_location,
            minimum_stock=0,
            unit_of_measure="unidad",
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/products/{product.id}/",
            {
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn(
            "storage_location",
            response.data,
        )

        product.refresh_from_db()

        self.assertFalse(product.is_active)

    def test_delete_location_is_not_allowed(self):
        response = self.client.delete(
            f"/api/inventory/locations/{self.location.id}/"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertTrue(
            StorageLocation.objects.filter(
                id=self.location.id,
            ).exists()
        )
