from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN, ROLE_CUSTOMERS
from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceRecord,
    InjectorServiceStatus,
    ServiceChargeLine,
)
from apps.customers.services import receive_injector

User = get_user_model()


class ServiceAmountsApiTest(APITestCase):
    """
    Punto 26: el servicio tiene descuento e impuesto al documento, igual
    que la venta (punto 19). price es el subtotal; los montos se calculan
    en vivo hasta entregar y ahí quedan congelados. Precio 20 000.
    """

    def setUp(self):
        call_command("setup_roles")

        self.admin = User.objects.create_user(
            username="amounts-admin",
            password="12345678",
        )
        self.admin.groups.add(Group.objects.get(name=ROLE_ADMIN))

        self.operator = User.objects.create_user(
            username="amounts-operator",
            password="12345678",
        )
        self.operator.groups.add(Group.objects.get(name=ROLE_CUSTOMERS))

        customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Cliente montos",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.injector = Injector.objects.create(
            customer=customer,
            injector_number="0445110999",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            price=Decimal("20000.0000"),
            created_by=self.admin,
            updated_by=self.admin,
        )
        # price = líneas de cobro + accesorios (punto 3 + 1B del plan del
        # 2026-10-22).
        self.line = ServiceChargeLine.objects.create(
            service_record=self.service_record,
            description="Mano de obra",
            quantity=1,
            unit_price=Decimal("20000.0000"),
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_authenticate(self.admin)

    def service_url(self, suffix=""):
        return (
            f"/api/customers/service-records/{self.service_record.id}/{suffix}"
        )

    def move_to_ready(self):
        self.service_record.status = InjectorServiceStatus.READY
        self.service_record.save(update_fields=["status"])

    def test_service_received_from_api_starts_with_13_percent_tax(self):
        response = self.client.post(
            "/api/customers/service-records/",
            {
                "injector": self.injector.id,
                "received_at": timezone.now().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data["tax_percentage"]), Decimal("13"))

    def test_service_received_by_code_has_no_tax(self):
        # Igual que las ventas: solo la pantalla pone el 13 %.
        record = receive_injector(
            injector=self.injector,
            received_at=timezone.now(),
            user=self.admin,
        )

        self.assertEqual(record.tax_percentage, Decimal("0"))

    def test_amounts_are_computed_live_before_delivery(self):
        # 20 000 − 10 % = 18 000 + 13 % = 20 340
        response = self.client.patch(
            self.service_url(),
            {
                "discount_type": "PERCENT",
                "discount_value": "10",
                "tax_percentage": "13",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data["subtotal"]), Decimal("20000.00"))
        self.assertEqual(
            Decimal(response.data["discount_amount"]),
            Decimal("2000.00"),
        )
        self.assertEqual(Decimal(response.data["tax_amount"]), Decimal("2340.00"))
        self.assertEqual(Decimal(response.data["total"]), Decimal("20340.00"))

        self.service_record.refresh_from_db()
        self.assertIsNone(self.service_record.total_amount)

    def test_delivery_freezes_amounts(self):
        self.client.patch(
            self.service_url(),
            {"discount_value": "1000", "tax_percentage": "13"},
            format="json",
        )
        self.move_to_ready()

        response = self.client.post(self.service_url("deliver/"), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.service_record.refresh_from_db()
        self.assertEqual(self.service_record.subtotal_amount, Decimal("20000.00"))
        self.assertEqual(self.service_record.discount_amount, Decimal("1000.00"))
        self.assertEqual(self.service_record.tax_amount, Decimal("2470.00"))
        self.assertEqual(self.service_record.total_amount, Decimal("21470.00"))

    def test_discount_greater_than_price_returns_400(self):
        response = self.client.patch(
            self.service_url(),
            {"discount_value": "20000.01"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discount_value", response.data)

    def test_price_below_discount_blocks_delivery(self):
        # El precio baja al editar una línea de cobro; el descuento que ya
        # no cabe se detecta al entregar, y el servicio sigue listo.
        self.client.patch(
            self.service_url(),
            {"discount_value": "5000"},
            format="json",
        )

        line = self.client.patch(
            f"/api/customers/service-charge-lines/{self.line.id}/",
            {"unit_price": "4000"},
            format="json",
        )
        self.assertEqual(line.status_code, status.HTTP_200_OK)

        self.move_to_ready()
        response = self.client.post(self.service_url("deliver/"), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.service_record.refresh_from_db()
        self.assertEqual(self.service_record.status, InjectorServiceStatus.READY)

    def test_tax_over_100_returns_400(self):
        response = self.client.patch(
            self.service_url(),
            {"tax_percentage": "101"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("tax_percentage", response.data)

    def test_operator_cannot_set_discount_or_tax(self):
        self.client.force_authenticate(self.operator)

        for field_name, value in (
            ("discount_value", "100"),
            ("tax_percentage", "13"),
            ("discount_type", "PERCENT"),
        ):
            with self.subTest(field=field_name):
                response = self.client.patch(
                    self.service_url(),
                    {field_name: value},
                    format="json",
                )

                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
                self.assertIn(field_name, response.data)

    def test_operator_does_not_see_amounts(self):
        self.client.force_authenticate(self.operator)

        response = self.client.get(self.service_url())

        for field_name in (
            "price",
            "discount_value",
            "tax_percentage",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total",
        ):
            with self.subTest(field=field_name):
                self.assertIsNone(response.data[field_name])
