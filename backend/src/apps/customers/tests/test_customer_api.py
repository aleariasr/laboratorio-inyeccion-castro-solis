from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_CUSTOMERS

from apps.customers.models import Customer, CustomerType

User = get_user_model()


class CustomerApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        customers_group, _ = Group.objects.get_or_create(
            name=ROLE_CUSTOMERS,
        )
        self.user.groups.add(customers_group)

        self.client.force_authenticate(self.user)

        self.customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Juan Pérez",
            identification="123456789",
            phone="88888888",
            email="juan@test.com",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_customers(self):
        response = self.client.get("/api/customers/customers/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

        self.assertEqual(item["display_name"], "JUAN PÉREZ")
        self.assertEqual(item["identification"], "123456789")

    def test_create_customer(self):
        response = self.client.post(
            "/api/customers/customers/",
            {
                "customer_type": CustomerType.COMPANY,
                "display_name": "Castro Solís S.A.",
                "identification": "3101123456",
                "phone": "22223333",
                "email": "empresa@test.com",
                "notes": "Cliente empresa",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        customer = Customer.objects.get(id=response.data["id"])

        self.assertEqual(customer.display_name, "CASTRO SOLÍS S.A.")
        self.assertEqual(customer.customer_type, CustomerType.COMPANY)
        self.assertEqual(customer.identification, "3101123456")
        self.assertEqual(customer.created_by, self.user)
        self.assertEqual(customer.updated_by, self.user)

    def test_create_customer_with_duplicate_identification_returns_400(self):
        response = self.client.post(
            "/api/customers/customers/",
            {
                "customer_type": CustomerType.PERSON,
                "display_name": "Otro cliente",
                "identification": "123456789",
                "phone": "",
                "email": "",
                "notes": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(
            Customer.objects.filter(
                identification="123456789",
            ).count(),
            1,
        )

    def test_update_customer(self):
        response = self.client.patch(
            f"/api/customers/customers/{self.customer.id}/",
            {
                "phone": "77777777",
                "notes": "Nota actualizada",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.customer.refresh_from_db()

        self.assertEqual(self.customer.phone, "77777777")
        self.assertEqual(self.customer.notes, "Nota actualizada")
        self.assertEqual(self.customer.updated_by, self.user)

    def test_search_customers(self):
        Customer.objects.create(
            customer_type=CustomerType.COMPANY,
            display_name="Castro Solís S.A.",
            identification="3101123456",
            phone="22223333",
            email="empresa@test.com",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/customers/customers/",
            {
                "q": "castro",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["display_name"],
            "CASTRO SOLÍS S.A.",
        )