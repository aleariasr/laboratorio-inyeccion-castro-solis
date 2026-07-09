from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
)
from apps.inventory.models import StorageLocation

User = get_user_model()


class InventoryPermissionApiTest(APITestCase):
    def setUp(self):
        self.inventory_user = User.objects.create_user(
            username="inventory",
            password="12345678",
        )
        inventory_group, _ = Group.objects.get_or_create(
            name=ROLE_INVENTORY,
        )
        self.inventory_user.groups.add(inventory_group)

        self.read_only_user = User.objects.create_user(
            username="readonly",
            password="12345678",
        )
        read_only_group, _ = Group.objects.get_or_create(
            name=ROLE_READ_ONLY,
        )
        self.read_only_user.groups.add(read_only_group)

        self.plain_user = User.objects.create_user(
            username="plain",
            password="12345678",
        )

        self.location = StorageLocation.objects.create(
            code="A101",
            description="Ubicación A101",
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

    def test_inventory_user_can_create_inventory_record(self):
        self.client.force_authenticate(self.inventory_user)

        response = self.client.post(
            "/api/inventory/locations/",
            {
                "code": "B202",
                "description": "Ubicación B202",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_read_only_user_can_list_inventory_records(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/inventory/locations/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_inventory_record(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/inventory/locations/",
            {
                "code": "C303",
                "description": "Ubicación C303",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_inventory_records(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/inventory/locations/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_inventory_records(self):
        response = self.client.get("/api/inventory/locations/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)