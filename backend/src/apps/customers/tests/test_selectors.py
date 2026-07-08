from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceRecord,
)
from apps.customers.selectors import (
    customer_by_identification,
    customer_search,
    injector_history,
)

User = get_user_model()


class CustomerSelectorTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="tester",
            password="12345678",
        )

        self.customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="JUAN PÉREZ",
            identification="123456789",
            phone="88888888",
            email="juan@test.com",
            created_by=self.user,
            updated_by=self.user,
        )

        self.company = Customer.objects.create(
            customer_type=CustomerType.COMPANY,
            display_name="CASTRO SOLÍS S.A.",
            identification="3101123456",
            phone="22223333",
            email="empresa@test.com",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_customer_by_identification(self):
        customer = customer_by_identification("123456789")

        self.assertEqual(customer, self.customer)

    def test_customer_search_by_name(self):
        results = list(customer_search("castro"))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0], self.company)

    def test_customer_search_by_phone(self):
        results = list(customer_search("8888"))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0], self.customer)

    def test_customer_search_ignores_inactive_customers(self):
        self.customer.is_active = False
        self.customer.save(update_fields=["is_active"])

        results = list(customer_search("juan"))

        self.assertEqual(results, [])


class InjectorSelectorTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="tester",
            password="12345678",
        )

        self.customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="JUAN PÉREZ",
            created_by=self.user,
            updated_by=self.user,
        )

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="0445110183",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_injector_history(self):
        InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            created_by=self.user,
            updated_by=self.user,
        )

        InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            created_by=self.user,
            updated_by=self.user,
        )

        history = injector_history(self.injector)

        self.assertEqual(history.count(), 2)