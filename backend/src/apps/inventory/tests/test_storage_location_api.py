from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.inventory.models import StorageLocation

User = get_user_model()


class StorageLocationApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

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
        self.assertEqual(len(response.data), 1)

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