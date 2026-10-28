from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN

from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceRecord,
    ServiceType,
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
            Group.objects.get(name=ROLE_ADMIN),
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


from apps.core.permissions import ROLE_CUSTOMERS  # noqa: E402


class ServiceTypeLaborPriceApiTest(APITestCase):
    """
    Punto 1A del plan del 2026-10-22: precio de mano de obra y descripción
    del tipo de servicio. El precio solo lo ve el Administrador.
    """

    URL = "/api/customers/service-types/"

    setUp = ServiceTypeApiTest.setUp

    def create_type(self):
        return self.client.post(
            self.URL,
            {
                "name": "Limpieza completa",
                "description": "Desarme, limpieza ultrasónica y prueba.",
                "default_labor_price": "15000",
            },
            format="json",
        )

    def test_create_with_labor_price(self):
        response = self.create_type()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Decimal(response.data["default_labor_price"]),
            Decimal("15000"),
        )
        self.assertNotIn("kit_items", response.data)

    def test_operator_reads_catalog_without_labor_price(self):
        self.create_type()

        operator = User.objects.create_user(
            username="operario-tipos",
            password="12345678",
        )
        operator.groups.add(Group.objects.get(name=ROLE_CUSTOMERS))
        self.client.force_authenticate(operator)

        response = self.client.get(self.URL, {"q": "limpieza"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["results"][0]["default_labor_price"])

        response = self.client.post(self.URL, {"name": "Otro"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_service_shows_type_without_price(self):
        service_type_id = self.create_type().data["id"]

        customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Cliente tipo",
            created_by=self.user,
            updated_by=self.user,
        )
        injector = Injector.objects.create(
            customer=customer,
            injector_number="TIPO-INY",
            created_by=self.user,
            updated_by=self.user,
        )
        service_record = InjectorServiceRecord.objects.create(
            injector=injector,
            received_at=timezone.now(),
            service_type_id=service_type_id,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            f"/api/customers/service-records/{service_record.id}/",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(response.data["service_type_detail"]),
            {"id", "name", "description", "is_active"},
        )
