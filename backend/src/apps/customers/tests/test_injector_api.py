from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_CUSTOMERS

from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
)

User = get_user_model()


class InjectorApiTest(APITestCase):
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

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="0445110183",
            description="Bosch Common Rail",
            notes="Inyector de prueba",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_injectors(self):
        response = self.client.get("/api/customers/injectors/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

        self.assertEqual(item["customer"], self.customer.id)
        self.assertEqual(
            item["customer_detail"]["display_name"],
            "JUAN PÉREZ",
        )
        self.assertEqual(item["injector_number"], "0445110183")
        self.assertEqual(item["description"], "Bosch Common Rail")

    def test_filter_injectors_by_customer(self):
        other_customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Ana López",
            created_by=self.user,
            updated_by=self.user,
        )

        Injector.objects.create(
            customer=other_customer,
            injector_number="9999999999",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/customers/injectors/",
            {
                "customer": self.customer.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["injector_number"],
            "0445110183",
        )

    def test_create_injector(self):
        response = self.client.post(
            "/api/customers/injectors/",
            {
                "customer": self.customer.id,
                "injector_number": "abc-123",
                "description": "Denso prueba",
                "notes": "Nuevo inyector",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        injector = Injector.objects.get(id=response.data["id"])

        self.assertEqual(injector.customer, self.customer)
        self.assertEqual(injector.injector_number, "ABC-123")
        self.assertEqual(injector.description, "Denso prueba")
        self.assertEqual(injector.notes, "Nuevo inyector")
        self.assertEqual(injector.created_by, self.user)
        self.assertEqual(injector.updated_by, self.user)

    def test_create_duplicate_injector_for_same_customer_returns_400(self):
        response = self.client.post(
            "/api/customers/injectors/",
            {
                "customer": self.customer.id,
                "injector_number": "0445110183",
                "description": "",
                "notes": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(
            Injector.objects.filter(
                customer=self.customer,
                injector_number="0445110183",
            ).count(),
            1,
        )

    def test_same_injector_number_allowed_for_different_customer(self):
        other_customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Ana López",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            "/api/customers/injectors/",
            {
                "customer": other_customer.id,
                "injector_number": "0445110183",
                "description": "",
                "notes": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.assertEqual(
            Injector.objects.filter(
                injector_number="0445110183",
            ).count(),
            2,
        )

    def test_update_injector(self):
        response = self.client.patch(
            f"/api/customers/injectors/{self.injector.id}/",
            {
                "description": "Descripción actualizada",
                "notes": "Notas actualizadas",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.injector.refresh_from_db()

        self.assertEqual(
            self.injector.description,
            "Descripción actualizada",
        )
        self.assertEqual(
            self.injector.notes,
            "Notas actualizadas",
        )
        self.assertEqual(self.injector.updated_by, self.user)