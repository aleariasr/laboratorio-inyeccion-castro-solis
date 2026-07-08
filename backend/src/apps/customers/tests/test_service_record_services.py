from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceRecord,
    InjectorServiceStatus,
)
from apps.customers.services import (
    receive_injector,
    start_service,
    mark_ready,
    deliver_service,
    cancel_service,
)

User = get_user_model()


class ReceiveInjectorServiceTest(TestCase):
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

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="0445110183",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_receive_injector(self):
        record = receive_injector(
            injector=self.injector,
            received_at=timezone.now(),
            user=self.user,
        )

        self.assertEqual(
            InjectorServiceRecord.objects.count(),
            1,
        )

        self.assertEqual(
            record.status,
            InjectorServiceStatus.RECEIVED,
        )
    
    def test_start_service(self):
        record = receive_injector(
            injector=self.injector,
            received_at=timezone.now(),
            user=self.user,
        )

        start_service(
            service_record=record,
            user=self.user,
        )

        record.refresh_from_db()

        self.assertEqual(
            record.status,
            InjectorServiceStatus.IN_PROGRESS,
        )

    def test_mark_ready(self):
        record = receive_injector(
            injector=self.injector,
            received_at=timezone.now(),
            user=self.user,
        )

        start_service(
            service_record=record,
            user=self.user,
        )

        mark_ready(
            service_record=record,
            user=self.user,
        )

        record.refresh_from_db()

        self.assertEqual(
            record.status,
            InjectorServiceStatus.READY,
        )


    def test_deliver_service(self):
        record = receive_injector(
            injector=self.injector,
            received_at=timezone.now(),
            user=self.user,
        )

        start_service(
            service_record=record,
            user=self.user,
        )

        mark_ready(
            service_record=record,
            user=self.user,
        )

        deliver_service(
            service_record=record,
            delivered_at=timezone.now(),
            user=self.user,
        )

        record.refresh_from_db()

        self.assertEqual(
            record.status,
            InjectorServiceStatus.DELIVERED,
        )

        self.assertIsNotNone(
            record.delivered_at,
        )


    def test_cancel_service(self):
        record = receive_injector(
            injector=self.injector,
            received_at=timezone.now(),
            user=self.user,
        )

        cancel_service(
            service_record=record,
            user=self.user,
        )

        record.refresh_from_db()

        self.assertEqual(
            record.status,
            InjectorServiceStatus.CANCELLED,
        )