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


class ServiceTypePriceHistoryTest(APITestCase):
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


from apps.core.permissions import ROLE_CUSTOMERS  # noqa: E402
from apps.customers.models import ServiceTypeAccessory  # noqa: E402
from apps.inventory.models import Product, StorageLocation  # noqa: E402


class ServiceTypeKitApiTest(APITestCase):
    """
    Punto 1A del plan del 2026-10-22: precio de mano de obra, descripción
    y kit de accesorios del tipo de servicio.
    """

    URL = "/api/customers/service-types/"

    setUp_base = ServiceTypeApiTest.setUp

    def setUp(self):
        self.setUp_base()

        location = StorageLocation.objects.create(
            code="K1",
            created_by=self.user,
            updated_by=self.user,
        )

        def product(code, is_active=True):
            return Product.objects.create(
                standard_code=code,
                name=f"Producto {code}",
                storage_location=location,
                is_active=is_active,
                created_by=self.user,
                updated_by=self.user,
            )

        self.filter = product("KIT-FILTRO")
        self.oring = product("KIT-ORING")
        self.inactive = product("KIT-VIEJO", is_active=False)

    def create_with_kit(self):
        return self.client.post(
            self.URL,
            {
                "name": "Limpieza completa",
                "description": "Desarme, limpieza ultrasónica y prueba.",
                "default_labor_price": "15000",
                "kit_items": [
                    {"product": self.filter.id, "quantity": 1},
                    {"product": self.oring.id, "quantity": 4},
                ],
            },
            format="json",
        )

    def test_create_with_labor_price_and_kit(self):
        response = self.create_with_kit()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data["default_labor_price"]), Decimal("15000"))
        self.assertEqual(
            [
                (item["product_detail"]["standard_code"], item["quantity"])
                for item in response.data["kit_items"]
            ],
            [("KIT-FILTRO", 1), ("KIT-ORING", 4)],
        )
        self.assertEqual(
            ServiceTypeAccessory.objects.filter(
                service_type_id=response.data["id"],
            ).count(),
            2,
        )

    def test_kit_rejects_repeated_and_inactive_products(self):
        cases = {
            "repetido": [
                {"product": self.filter.id, "quantity": 1},
                {"product": self.filter.id, "quantity": 2},
            ],
            "inactivo": [{"product": self.inactive.id, "quantity": 1}],
            "cantidad cero": [{"product": self.filter.id, "quantity": 0}],
        }

        for case, kit_items in cases.items():
            with self.subTest(case=case):
                response = self.client.post(
                    self.URL,
                    {"name": f"Tipo {case}", "kit_items": kit_items},
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("kit_items", response.data)

    def test_update_replaces_kit_only_when_sent(self):
        service_type_id = self.create_with_kit().data["id"]
        url = f"{self.URL}{service_type_id}/"

        # Sin kit_items, el kit queda igual.
        response = self.client.patch(url, {"name": "Limpieza total"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["kit_items"]), 2)

        # Con kit_items, la lista enviada reemplaza a la anterior.
        response = self.client.patch(
            url,
            {"kit_items": [{"product": self.oring.id, "quantity": 6}]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [
                (item["product"], item["quantity"])
                for item in response.data["kit_items"]
            ],
            [(self.oring.id, 6)],
        )

        # Y una lista vacía lo deja sin kit.
        response = self.client.patch(url, {"kit_items": []}, format="json")
        self.assertEqual(response.data["kit_items"], [])

    def test_operator_reads_catalog_without_labor_price(self):
        self.create_with_kit()

        operator = User.objects.create_user(
            username="operario-kit",
            password="12345678",
        )
        operator.groups.add(Group.objects.get(name=ROLE_CUSTOMERS))
        self.client.force_authenticate(operator)

        response = self.client.get(self.URL, {"q": "limpieza"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["results"][0]
        self.assertIsNone(item["default_labor_price"])
        self.assertEqual(len(item["kit_items"]), 2)

        response = self.client.post(self.URL, {"name": "Otro"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_service_shows_type_without_price_or_kit(self):
        service_type_id = self.create_with_kit().data["id"]

        customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Cliente kit",
            created_by=self.user,
            updated_by=self.user,
        )
        injector = Injector.objects.create(
            customer=customer,
            injector_number="KIT-INY",
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
