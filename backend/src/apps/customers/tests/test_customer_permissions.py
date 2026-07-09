from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_CUSTOMERS,
    ROLE_READ_ONLY,
)
from apps.customers.models import Customer

User = get_user_model()


class CustomerPermissionApiTest(APITestCase):
    def setUp(self):
        self.customers_user = User.objects.create_user(
            username="customers",
            password="12345678",
        )
        customers_group, _ = Group.objects.get_or_create(
            name=ROLE_CUSTOMERS,
        )
        self.customers_user.groups.add(customers_group)

        self.read_only_user = User.objects.create_user(
            username="readonly-customers",
            password="12345678",
        )
        read_only_group, _ = Group.objects.get_or_create(
            name=ROLE_READ_ONLY,
        )
        self.read_only_user.groups.add(read_only_group)

        self.plain_user = User.objects.create_user(
            username="plain-customers",
            password="12345678",
        )

        self.customer = Customer.objects.create(
            customer_type="PERSON",
            display_name="Cliente prueba",
            created_by=self.customers_user,
            updated_by=self.customers_user,
        )

    def test_customers_user_can_create_customer(self):
        self.client.force_authenticate(self.customers_user)

        response = self.client.post(
            "/api/customers/customers/",
            {
                "customer_type": "PERSON",
                "display_name": "Cliente nuevo",
                "identification": "1-1111-1111",
                "phone": "8888-8888",
                "email": "cliente@example.com",
                "notes": "Cliente de prueba",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_read_only_user_can_list_customers(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/customers/customers/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_customer(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/customers/customers/",
            {
                "customer_type": "PERSON",
                "display_name": "Cliente bloqueado",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_customers(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/customers/customers/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_customers(self):
        response = self.client.get("/api/customers/customers/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)