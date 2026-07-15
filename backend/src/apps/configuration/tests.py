from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_ADMIN,
    ROLE_INVENTORY,
)

User = get_user_model()


class SystemStatusApiTest(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username="status-admin",
            password="12345678",
        )

        admin_group, _ = Group.objects.get_or_create(
            name=ROLE_ADMIN,
        )
        self.admin_user.groups.add(admin_group)

        self.regular_user = User.objects.create_user(
            username="status-regular",
            password="12345678",
        )

        inventory_group, _ = Group.objects.get_or_create(
            name=ROLE_INVENTORY,
        )
        self.regular_user.groups.add(inventory_group)

    def test_system_status_requires_authentication(self):
        response = self.client.get("/api/system/status/")

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_system_status_rejects_non_admin_user(self):
        self.client.force_authenticate(self.regular_user)

        response = self.client.get("/api/system/status/")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_system_status_allows_admin_role(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get("/api/system/status/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["status"],
            "healthy",
        )
        self.assertEqual(
            response.data["service"],
            "Laboratorio de Inyección Castro Solís",
        )
        self.assertIn("version", response.data)
        self.assertIn("server_time", response.data)

        self.assertIn(
            response.data["environment"]["name"],
            {
                "development",
                "production",
            },
        )
        self.assertIn(
            "debug",
            response.data["environment"],
        )
        self.assertNotIn(
            "settings_module",
            response.data["environment"],
        )

        self.assertEqual(
            response.data["user"]["username"],
            "status-admin",
        )
        self.assertIn(
            ROLE_ADMIN,
            response.data["user"]["groups"],
        )

        self.assertIn(
            "inventory",
            response.data["modules"],
        )
        self.assertIn(
            "reports",
            response.data["modules"],
        )
        self.assertIn(
            "documents",
            response.data["modules"],
        )

    def test_system_status_allows_staff_user(self):
        staff_user = User.objects.create_user(
            username="status-staff",
            password="12345678",
            is_staff=True,
        )
        self.client.force_authenticate(staff_user)

        response = self.client.get("/api/system/status/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

    def test_system_status_allows_superuser(self):
        superuser = User.objects.create_superuser(
            username="status-superuser",
            password="12345678",
            email="admin@example.com",
        )
        self.client.force_authenticate(superuser)

        response = self.client.get("/api/system/status/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
