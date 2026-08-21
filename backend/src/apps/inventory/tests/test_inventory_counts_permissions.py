from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
)
from apps.inventory.models import InventoryCount

User = get_user_model()


def _module_permission(codename):
    return Permission.objects.get(
        content_type__app_label="core",
        content_type__model="modulepermissions",
        codename=codename,
    )


class InventoryCountsPermissionApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.inventory_user = User.objects.create_user(
            username="counts-inventory",
            password="12345678",
        )
        self.inventory_user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        self.read_only_user = User.objects.create_user(
            username="counts-readonly",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="counts-plain",
            password="12345678",
        )

        # Conteo en borrador: alcanza para probar create/change/cancel
        # sin pasar por approve() y su generación de movimientos de
        # ajuste, que no es lo que este archivo prueba.
        self.inventory_count = InventoryCount.objects.create(
            reference="PERM-CNT-001",
            count_date=date.today(),
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

    def _user_with_permission(self, codename, username):
        user = User.objects.create_user(
            username=username,
            password="12345678",
        )
        user.user_permissions.add(_module_permission(codename))
        return user

    def test_inventory_user_can_create_inventory_count(self):
        self.client.force_authenticate(self.inventory_user)

        response = self.client.post(
            "/api/inventory/inventory-counts/",
            {
                "reference": "PERM-CNT-002",
                "count_date": str(date.today()),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_read_only_user_can_list_inventory_counts(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/inventory/inventory-counts/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_inventory_count(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/inventory/inventory-counts/",
            {
                "reference": "PERM-CNT-003",
                "count_date": str(date.today()),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_inventory_counts(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/inventory/inventory-counts/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_inventory_counts(self):
        response = self.client.get("/api/inventory/inventory-counts/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inventory_user_can_cancel_draft_inventory_count(self):
        self.client.force_authenticate(self.inventory_user)

        response = self.client.post(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_user_with_only_change_inventory_counts_permission_cannot_cancel(self):
        user = self._user_with_permission(
            "change_inventory_counts",
            "counts-change-only",
        )
        self.client.force_authenticate(user)

        response = self.client.post(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_with_only_cancel_inventory_counts_permission_can_cancel_but_not_update(self):
        user = self._user_with_permission(
            "cancel_inventory_counts",
            "counts-cancel-only",
        )
        self.client.force_authenticate(user)

        update_response = self.client.patch(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/",
            {"notes": "Intento de edición"},
            format="json",
        )

        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)

        cancel_response = self.client.post(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_cancel_inventory_count(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            f"/api/inventory/inventory-counts/{self.inventory_count.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
