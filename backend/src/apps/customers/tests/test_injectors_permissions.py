from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_CUSTOMERS,
    ROLE_READ_ONLY,
)
from apps.customers.models import Customer, Injector

User = get_user_model()


class InjectorsPermissionApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.customers_user = User.objects.create_user(
            username="injectors-customers",
            password="12345678",
        )
        self.customers_user.groups.add(
            Group.objects.get(name=ROLE_CUSTOMERS),
        )

        self.read_only_user = User.objects.create_user(
            username="injectors-readonly",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="injectors-plain",
            password="12345678",
        )

        self.customer = Customer.objects.create(
            display_name="Cliente inyectores",
            created_by=self.customers_user,
            updated_by=self.customers_user,
        )

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="INY-PERM-001",
            created_by=self.customers_user,
            updated_by=self.customers_user,
        )

    def test_customers_user_can_create_injector(self):
        self.client.force_authenticate(self.customers_user)

        response = self.client.post(
            "/api/customers/injectors/",
            {
                "customer": self.customer.id,
                "injector_number": "INY-PERM-002",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_customers_user_can_update_injector(self):
        self.client.force_authenticate(self.customers_user)

        response = self.client.patch(
            f"/api/customers/injectors/{self.injector.id}/",
            {"description": "Actualizado"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_can_list_injectors(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/customers/injectors/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_injector(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/customers/injectors/",
            {
                "customer": self.customer.id,
                "injector_number": "INY-PERM-003",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_read_only_user_cannot_update_injector(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.patch(
            f"/api/customers/injectors/{self.injector.id}/",
            {"description": "Intento de edición"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_injectors(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/customers/injectors/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_injectors(self):
        response = self.client.get("/api/customers/injectors/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
