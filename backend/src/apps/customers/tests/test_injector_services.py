from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.customers.exceptions import InjectorAlreadyExistsError
from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
)
from apps.customers.services import register_injector

User = get_user_model()


class RegisterInjectorServiceTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="tester",
            password="12345678",
        )

        self.customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Juan Pérez",
            identification="123",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_register_injector(self):
        injector = register_injector(
            customer=self.customer,
            injector_number="0445110183",
            description="Bosch Common Rail",
            notes="",
            user=self.user,
        )

        self.assertEqual(
            Injector.objects.count(),
            1,
        )

        self.assertEqual(
            injector.injector_number,
            "0445110183",
        )

    def test_duplicate_injector(self):
        register_injector(
            customer=self.customer,
            injector_number="0445110183",
            description="",
            notes="",
            user=self.user,
        )

        with self.assertRaises(
            InjectorAlreadyExistsError
        ):
            register_injector(
                customer=self.customer,
                injector_number="0445110183",
                description="",
                notes="",
                user=self.user,
            )