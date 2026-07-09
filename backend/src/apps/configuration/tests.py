from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN

User = get_user_model()


class SystemStatusApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="status-user",
            password="12345678",
        )

        admin_group, _ = Group.objects.get_or_create(
            name=ROLE_ADMIN,
        )
        self.user.groups.add(admin_group)

    def test_system_status_requires_authentication(self):
        response = self.client.get("/api/system/status/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_system_status_returns_basic_information(self):
        self.client.force_authenticate(self.user)

        response = self.client.get("/api/system/status/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "healthy")
        self.assertEqual(
            response.data["service"],
            "Laboratorio de Inyección Castro Solís",
        )
        self.assertIn("version", response.data)
        self.assertIn("server_time", response.data)
        self.assertIn("environment", response.data)
        self.assertEqual(
            response.data["user"]["username"],
            "status-user",
        )
        self.assertIn(
            ROLE_ADMIN,
            response.data["user"]["groups"],
        )
        self.assertIn("inventory", response.data["modules"])
        self.assertIn("reports", response.data["modules"])