from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_READ_ONLY,
    ROLE_SALES,
)
from apps.customers.models import Customer
from apps.sales.models import Sale

User = get_user_model()


class SalesPermissionApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.sales_user = User.objects.create_user(
            username="sales",
            password="12345678",
        )
        self.sales_user.groups.add(
            Group.objects.get(name=ROLE_SALES),
        )

        self.read_only_user = User.objects.create_user(
            username="readonly-sales",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="plain-sales",
            password="12345678",
        )

        self.customer = Customer.objects.create(
            customer_type="PERSON",
            display_name="Cliente prueba",
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        self.sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date.today(),
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

    def test_sales_user_can_create_sale(self):
        self.client.force_authenticate(self.sales_user)

        response = self.client.post(
            "/api/sales/sales/",
            {
                "customer": self.customer.id,
                "sale_date": str(date.today()),
                "currency": "CRC",
                "notes": "Venta de prueba",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_read_only_user_can_list_sales(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/sales/sales/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_sale(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/sales/sales/",
            {
                "customer": self.customer.id,
                "sale_date": str(date.today()),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_sales(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/sales/sales/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_sales(self):
        response = self.client.get("/api/sales/sales/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
