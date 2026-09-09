from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_CUSTOMERS

from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceRecord,
    ServiceType,
    ServiceTypePriceHistory,
)

User = get_user_model()


class ServiceTypeApiTest(APITestCase):
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

        self.service_type = ServiceType.objects.create(
            name="Arreglar carro",
            description="Servicio general",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_service_types(self):
        response = self.client.get("/api/customers/service-types/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["name"],
            "ARREGLAR CARRO",
        )

    def test_create_service_type(self):
        response = self.client.post(
            "/api/customers/service-types/",
            {
                "name": "limpieza de inyectores",
                "description": "Limpieza ultrasónica",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        service_type = ServiceType.objects.get(id=response.data["id"])

        self.assertEqual(service_type.name, "LIMPIEZA DE INYECTORES")
        self.assertEqual(service_type.created_by, self.user)

    def test_duplicate_service_type_returns_400(self):
        response = self.client.post(
            "/api/customers/service-types/",
            {
                "name": "arreglar carro",
                "description": "Duplicado",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            ServiceType.objects.filter(name="ARREGLAR CARRO").count(),
            1,
        )

    def test_update_service_type(self):
        response = self.client.patch(
            f"/api/customers/service-types/{self.service_type.id}/",
            {
                "description": "Descripción actualizada",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.service_type.refresh_from_db()

        self.assertEqual(
            self.service_type.description,
            "Descripción actualizada",
        )
        self.assertEqual(self.service_type.updated_by, self.user)


class ServiceTypePriceHistoryTest(APITestCase):
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
            display_name="Cliente prueba",
            identification="987654321",
            created_by=self.user,
            updated_by=self.user,
        )

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="0445110184",
            created_by=self.user,
            updated_by=self.user,
        )

        self.service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            created_by=self.user,
            updated_by=self.user,
        )

        self.service_type = ServiceType.objects.create(
            name="Arreglar carro",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_setting_price_and_service_type_creates_history_entry(self):
        response = self.client.patch(
            f"/api/customers/service-records/{self.service_record.id}/",
            {
                "service_type": self.service_type.id,
                "price": "15000.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        history = ServiceTypePriceHistory.objects.get(
            service_type=self.service_type,
            service_record=self.service_record,
        )

        self.assertEqual(history.price, Decimal("15000.0000"))
        self.assertEqual(history.created_by, self.user)

    def test_editing_price_again_updates_the_same_history_entry(self):
        self.client.patch(
            f"/api/customers/service-records/{self.service_record.id}/",
            {
                "service_type": self.service_type.id,
                "price": "15000.0000",
            },
            format="json",
        )

        response = self.client.patch(
            f"/api/customers/service-records/{self.service_record.id}/",
            {
                "price": "18000.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(
            ServiceTypePriceHistory.objects.filter(
                service_type=self.service_type,
                service_record=self.service_record,
            ).count(),
            1,
        )

        history = ServiceTypePriceHistory.objects.get(
            service_type=self.service_type,
            service_record=self.service_record,
        )

        self.assertEqual(history.price, Decimal("18000.0000"))

    def test_setting_price_without_service_type_creates_no_history(self):
        response = self.client.patch(
            f"/api/customers/service-records/{self.service_record.id}/",
            {
                "price": "5000.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(ServiceTypePriceHistory.objects.count(), 0)

    def test_filter_price_history_by_service_type(self):
        self.client.patch(
            f"/api/customers/service-records/{self.service_record.id}/",
            {
                "service_type": self.service_type.id,
                "price": "15000.0000",
            },
            format="json",
        )

        response = self.client.get(
            "/api/customers/service-type-price-history/",
            {
                "service_type": self.service_type.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["price"],
            "15000.0000",
        )
