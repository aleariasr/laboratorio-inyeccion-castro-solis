from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.customers.exceptions import (
    CustomerAlreadyExistsError,
)
from apps.customers.models import (
    Customer,
    CustomerType,
)
from apps.customers.services import (
    register_customer,
)

User = get_user_model()


class RegisterCustomerServiceTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="tester",
            password="12345678",
        )

    def test_register_person(self):
        customer = register_customer(
            customer_type=CustomerType.PERSON,
            display_name="Juan Pérez",
            identification="123456789",
            phone="88888888",
            email="juan@test.com",
            notes="",
            user=self.user,
        )

        self.assertEqual(
            Customer.objects.count(),
            1,
        )

        self.assertEqual(
            customer.display_name,
            "JUAN PÉREZ",
        )

        self.assertEqual(
            customer.customer_type,
            CustomerType.PERSON,
        )

    def test_register_company(self):
        customer = register_customer(
            customer_type=CustomerType.COMPANY,
            display_name="Castro Solís S.A.",
            identification="3101123456",
            phone="22223333",
            email="empresa@test.com",
            notes="",
            user=self.user,
        )

        self.assertEqual(
            customer.customer_type,
            CustomerType.COMPANY,
        )

    def test_duplicate_identification(self):
        register_customer(
            customer_type=CustomerType.PERSON,
            display_name="Juan Pérez",
            identification="123",
            phone="",
            email="",
            notes="",
            user=self.user,
        )

        with self.assertRaises(
            CustomerAlreadyExistsError
        ):
            register_customer(
                customer_type=CustomerType.PERSON,
                display_name="Otro",
                identification="123",
                phone="",
                email="",
                notes="",
                user=self.user,
            )