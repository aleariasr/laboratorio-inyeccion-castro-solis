from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY

from apps.inventory.models import StorageLocation

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
