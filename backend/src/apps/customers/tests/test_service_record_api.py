from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_CUSTOMERS

from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceRecord,
    InjectorServiceStatus,
)

User = get_user_model()


class InjectorServiceRecordApiTest(APITestCase):
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
            created_by=self.user,
            updated_by=self.user,
        )

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="0445110183",
            created_by=self.user,
            updated_by=self.user,
        )

        self.service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            notes_before="Recibido para prueba",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_service_records(self):
        response = self.client.get("/api/customers/service-records/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

        item = response.data["results"][0]

        self.assertEqual(item["injector"], self.injector.id)
        self.assertEqual(item["status"], InjectorServiceStatus.RECEIVED)
        self.assertEqual(
            item["injector_detail"]["injector_number"],
            "0445110183",
        )

    def test_filter_service_records_by_injector(self):
        other_injector = Injector.objects.create(
            customer=self.customer,
            injector_number="9999999999",
            created_by=self.user,
            updated_by=self.user,
        )

        InjectorServiceRecord.objects.create(
            injector=other_injector,
            received_at=timezone.now(),
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/customers/service-records/",
            {
                "injector": self.injector.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["injector"],
            self.injector.id,
        )

    def test_create_service_record(self):
        received_at = timezone.now()

        response = self.client.post(
            "/api/customers/service-records/",
            {
                "injector": self.injector.id,
                "received_at": received_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        service_record = InjectorServiceRecord.objects.get(
            id=response.data["id"],
        )

        self.assertEqual(service_record.injector, self.injector)
        self.assertEqual(
            service_record.status,
            InjectorServiceStatus.RECEIVED,
        )
        self.assertEqual(service_record.created_by, self.user)
        self.assertEqual(service_record.updated_by, self.user)

    def test_update_service_record_technical_data(self):
        response = self.client.patch(
            f"/api/customers/service-records/{self.service_record.id}/",
            {
                "resistance": "1.250",
                "leakage": "0.100",
                "notes_before": "Notas antes",
                "notes_after": "Notas después",
                "observations": "Observaciones internas",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.service_record.refresh_from_db()

        self.assertEqual(str(self.service_record.resistance), "1.250")
        self.assertEqual(str(self.service_record.leakage), "0.100")
        self.assertEqual(self.service_record.notes_before, "Notas antes")
        self.assertEqual(self.service_record.notes_after, "Notas después")
        self.assertEqual(
            self.service_record.observations,
            "Observaciones internas",
        )
        self.assertEqual(self.service_record.updated_by, self.user)

    def test_start_service(self):
        response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/start/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.service_record.refresh_from_db()

        self.assertEqual(
            self.service_record.status,
            InjectorServiceStatus.IN_PROGRESS,
        )

    def test_mark_ready_service(self):
        self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/start/",
            {},
            format="json",
        )

        response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/mark-ready/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.service_record.refresh_from_db()

        self.assertEqual(
            self.service_record.status,
            InjectorServiceStatus.READY,
        )

    def test_deliver_service(self):
        self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/start/",
            {},
            format="json",
        )
        self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/mark-ready/",
            {},
            format="json",
        )

        response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/deliver/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.service_record.refresh_from_db()

        self.assertEqual(
            self.service_record.status,
            InjectorServiceStatus.DELIVERED,
        )
        self.assertIsNotNone(self.service_record.delivered_at)

    def test_cancel_service(self):
        response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/cancel/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.service_record.refresh_from_db()

        self.assertEqual(
            self.service_record.status,
            InjectorServiceStatus.CANCELLED,
        )

    def test_invalid_transition_returns_400(self):
        response = self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/mark-ready/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.service_record.refresh_from_db()

        self.assertEqual(
            self.service_record.status,
            InjectorServiceStatus.RECEIVED,
        )

    def test_cannot_modify_delivered_service(self):
        self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/start/",
            {},
            format="json",
        )
        self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/mark-ready/",
            {},
            format="json",
        )
        self.client.post(
            f"/api/customers/service-records/{self.service_record.id}/deliver/",
            {},
            format="json",
        )

        response = self.client.patch(
            f"/api/customers/service-records/{self.service_record.id}/",
            {
                "observations": "No debería cambiar",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.service_record.refresh_from_db()

        self.assertNotEqual(
            self.service_record.observations,
            "No debería cambiar",
        )