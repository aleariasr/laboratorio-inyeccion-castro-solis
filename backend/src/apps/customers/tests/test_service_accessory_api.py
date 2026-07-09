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
    InjectorAccessory,
    InjectorServiceAccessory,
    InjectorServiceRecord,
    InjectorServiceStatus,
)

User = get_user_model()


class InjectorServiceAccessoryApiTest(APITestCase):
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
            created_by=self.user,
            updated_by=self.user,
        )

        self.accessory = InjectorAccessory.objects.create(
            name="Filtro",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_create_service_accessory(self):
        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "accessory": self.accessory.id,
                "quantity": 2,
                "notes": "Incluye filtro",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        service_accessory = InjectorServiceAccessory.objects.get(
            id=response.data["id"],
        )

        self.assertEqual(
            service_accessory.service_record,
            self.service_record,
        )
        self.assertEqual(service_accessory.accessory, self.accessory)
        self.assertEqual(service_accessory.quantity, 2)
        self.assertEqual(service_accessory.notes, "Incluye filtro")
        self.assertEqual(service_accessory.created_by, self.user)
        self.assertEqual(service_accessory.updated_by, self.user)

    def test_list_service_accessories(self):
        InjectorServiceAccessory.objects.create(
            service_record=self.service_record,
            accessory=self.accessory,
            quantity=1,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/customers/service-accessories/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

        self.assertEqual(item["service_record"], self.service_record.id)
        self.assertEqual(item["accessory"], self.accessory.id)
        self.assertEqual(item["accessory_detail"]["name"], "FILTRO")

    def test_filter_service_accessories_by_service_record(self):
        other_service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            created_by=self.user,
            updated_by=self.user,
        )

        other_accessory = InjectorAccessory.objects.create(
            name="Empaque",
            created_by=self.user,
            updated_by=self.user,
        )

        InjectorServiceAccessory.objects.create(
            service_record=self.service_record,
            accessory=self.accessory,
            created_by=self.user,
            updated_by=self.user,
        )

        InjectorServiceAccessory.objects.create(
            service_record=other_service_record,
            accessory=other_accessory,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["service_record"],
            self.service_record.id,
        )

    def test_duplicate_service_accessory_returns_400(self):
        InjectorServiceAccessory.objects.create(
            service_record=self.service_record,
            accessory=self.accessory,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "accessory": self.accessory.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(
            InjectorServiceAccessory.objects.filter(
                service_record=self.service_record,
                accessory=self.accessory,
            ).count(),
            1,
        )

    def test_update_service_accessory(self):
        service_accessory = InjectorServiceAccessory.objects.create(
            service_record=self.service_record,
            accessory=self.accessory,
            quantity=1,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/customers/service-accessories/{service_accessory.id}/",
            {
                "quantity": 3,
                "notes": "Actualizado",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        service_accessory.refresh_from_db()

        self.assertEqual(service_accessory.quantity, 3)
        self.assertEqual(service_accessory.notes, "Actualizado")
        self.assertEqual(service_accessory.updated_by, self.user)

    def test_cannot_create_accessory_for_delivered_service(self):
        self.service_record.status = InjectorServiceStatus.DELIVERED
        self.service_record.delivered_at = timezone.now()
        self.service_record.save(
            update_fields=[
                "status",
                "delivered_at",
            ]
        )

        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "accessory": self.accessory.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_update_accessory_for_cancelled_service(self):
        service_accessory = InjectorServiceAccessory.objects.create(
            service_record=self.service_record,
            accessory=self.accessory,
            quantity=1,
            created_by=self.user,
            updated_by=self.user,
        )

        self.service_record.status = InjectorServiceStatus.CANCELLED
        self.service_record.save(update_fields=["status"])

        response = self.client.patch(
            f"/api/customers/service-accessories/{service_accessory.id}/",
            {
                "quantity": 2,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        service_accessory.refresh_from_db()

        self.assertEqual(service_accessory.quantity, 1)

    def test_quantity_must_be_positive(self):
        response = self.client.post(
            "/api/customers/service-accessories/",
            {
                "service_record": self.service_record.id,
                "accessory": self.accessory.id,
                "quantity": 0,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)