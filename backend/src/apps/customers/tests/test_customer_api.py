from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
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

        call_command("setup_roles")

        self.user.groups.add(
            Group.objects.get(name=ROLE_CUSTOMERS),
        )

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
        self.assertEqual(response.data["count"], 1)

        item = response.data["results"][0]

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
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["display_name"],
            "CASTRO SOLÍS S.A.",
        )

    def test_search_customers_includes_inactive(self):
        inactive_customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Cliente inactivo",
            identification="999999999",
            created_by=self.user,
            updated_by=self.user,
            is_active=False,
        )

        response = self.client.get(
            "/api/customers/customers/",
            {
                "q": "inactivo",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["id"],
            inactive_customer.id,
        )

    def test_filter_customers_by_customer_type(self):
        Customer.objects.create(
            customer_type=CustomerType.COMPANY,
            display_name="Castro Solís S.A.",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/customers/customers/",
            {
                "customer_type": "company",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["customer_type"],
            CustomerType.COMPANY,
        )

    def test_filter_customers_by_is_active(self):
        Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Cliente inactivo",
            created_by=self.user,
            updated_by=self.user,
            is_active=False,
        )

        response = self.client.get(
            "/api/customers/customers/",
            {
                "is_active": "false",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["display_name"],
            "CLIENTE INACTIVO",
        )

    def test_order_customers_by_created_at(self):
        Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Ana Última",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/customers/customers/",
            {
                "ordering": "-created_at",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["results"][0]["display_name"],
            "ANA ÚLTIMA",
        )

    def test_update_customer_with_duplicate_identification_returns_400(self):
        Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Otro cliente",
            identification="555555555",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/customers/customers/{self.customer.id}/",
            {
                "identification": "555555555",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.identification, "123456789")

    def test_update_customer_keeps_own_identification(self):
        response = self.client.patch(
            f"/api/customers/customers/{self.customer.id}/",
            {
                "identification": "123456789",
                "notes": "Actualizado",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)