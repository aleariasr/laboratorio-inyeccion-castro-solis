"""
Auditoría integral del 2026-11-07:

- H-17: los mensajes genéricos de DRF/Django llegan en tono neutro (antes
  "Asegúrese de que…", "Este campo es requerido." y algunos en inglés). Los
  mensajes propios del sistema no cambian.
- H-18: los montos calculados de ventas, servicios y caja llegan como texto
  exacto, igual que los DecimalField (antes como número JSON).
"""

import json
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cash.models import CashClosing
from apps.cash.selectors import week_start_for
from apps.core.exceptions import neutral_message
from apps.core.permissions import ROLE_ADMIN
from apps.customers.models import Customer, Injector, InjectorServiceRecord
from apps.inventory.models import Product, StorageLocation
from apps.inventory.services import initial_inventory
from apps.sales.models import Sale, SaleItem
from apps.sales.services import confirm_sale

User = get_user_model()


class NeutralMessageTest(SimpleTestCase):
    def test_generic_messages_are_rewritten(self):
        cases = {
            "Este campo es requerido.": "Este campo es obligatorio.",
            "Este campo no puede estar en blanco.": "Este campo es obligatorio.",
            "Este campo no puede ser nulo.": "Este campo es obligatorio.",
            "Asegúrese de que este valor es mayor o igual a 0.01.": (
                "El valor debe ser mayor o igual a 0.01."
            ),
            "Asegúrese de que este valor es menor o igual a 100.": (
                "El valor debe ser menor o igual a 100."
            ),
            "Asegúrese de que este campo no tenga más de 10 caracteres.": (
                "El texto admite como máximo 10 caracteres."
            ),
            "Asegúrese de que no haya más de 14 dígitos en total.": (
                "El número admite como máximo 14 dígitos."
            ),
            "Asegúrese de que no haya más de 4 decimales.": (
                "El número admite como máximo 4 decimales."
            ),
            "Se requiere un número válido.": "El valor debe ser un número.",
            "Introduzca un número entero válido.": "El valor debe ser un número entero.",
            "Fecha con formato erróneo. Use uno de los siguientes formatos en "
            "su lugar: YYYY-MM-DD.": "La fecha no es válida.",
            '"BITCOIN" no es una elección válida.': "La opción elegida no es válida.",
            'Clave primaria "9" inválida - objeto no existe.': (
                "El registro elegido no existe."
            ),
            "No Sale matches the given query.": "El registro no existe.",
            "JSON parse error - Expecting value: line 1 column 1 (char 0)": (
                "Los datos enviados no son válidos."
            ),
        }

        for original, expected in cases.items():
            with self.subTest(original=original):
                self.assertEqual(neutral_message(original), expected)

    def test_own_messages_are_left_alone(self):
        for text in (
            "Ya existe una ubicación con este código.",
            "El descuento no puede ser mayor que el subtotal.",
            "La fecha de la venta no puede ser futura.",
        ):
            self.assertEqual(neutral_message(text), text)


class ApiMessagesAndAmountsTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.user = User.objects.create_user(
            username="messages-amounts-admin",
            password="12345678",
        )
        self.user.groups.add(Group.objects.get(name=ROLE_ADMIN))
        self.client.force_authenticate(self.user)

        self.location = StorageLocation.objects.create(
            code="A101",
            created_by=self.user,
            updated_by=self.user,
        )
        self.product = Product.objects.create(
            standard_code="P-001",
            name="Producto prueba",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )
        initial_inventory(product=self.product, quantity=20, user=self.user)

    # --- H-17 ---------------------------------------------------------

    def test_required_field_message_is_neutral(self):
        response = self.client.post("/api/inventory/locations/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], ["Este campo es obligatorio."])
        # El código del error se conserva.
        self.assertEqual(response.data["code"][0].code, "required")

    def test_max_length_message_is_neutral(self):
        response = self.client.post(
            "/api/inventory/locations/",
            {"code": "A" * 20},
            format="json",
        )

        self.assertEqual(
            response.data["code"],
            ["El texto admite como máximo 10 caracteres."],
        )

    def test_min_value_message_is_neutral(self):
        response = self.client.post(
            "/api/cash/petty-cash/",
            {"date": timezone.localdate().isoformat(), "amount": "0", "reason": "x"},
            format="json",
        )

        self.assertEqual(
            response.data["amount"],
            ["El valor debe ser mayor o igual a 0.01."],
        )

    def test_own_messages_are_unchanged(self):
        self.client.post("/api/inventory/locations/", {"code": "B1"}, format="json")

        response = self.client.post(
            "/api/inventory/locations/",
            {"code": "b1"},
            format="json",
        )

        self.assertEqual(
            response.data["code"],
            ["Ya existe una ubicación con este código."],
        )

    def test_not_found_and_bad_json_are_in_spanish(self):
        not_found = self.client.get("/api/sales/sales/999999/")
        bad_json = self.client.post(
            "/api/inventory/locations/",
            data="{mal",
            content_type="application/json",
        )

        self.assertEqual(not_found.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(not_found.data["detail"], "El registro no existe.")
        self.assertEqual(bad_json.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad_json.data["detail"], "Los datos enviados no son válidos.")

    # --- H-18 ---------------------------------------------------------

    def rendered(self, response):
        return json.loads(response.content)

    def test_sale_amounts_are_exact_text(self):
        sale = Sale.objects.create(
            sale_date=timezone.localdate(),
            tax_percentage=Decimal("13"),
            created_by=self.user,
            updated_by=self.user,
        )
        SaleItem.objects.create(
            sale=sale,
            product=self.product,
            quantity=3,
            unit_price=Decimal("1000.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        draft = self.rendered(self.client.get(f"/api/sales/sales/{sale.id}/"))
        self.assertEqual(draft["total"], "3390.00")
        self.assertEqual(draft["tax_amount"], "390.00")
        self.assertEqual(draft["items"][0]["subtotal"], "3000.0000")

        confirm_sale(sale=sale, user=self.user)

        confirmed = self.rendered(self.client.get(f"/api/sales/sales/{sale.id}/"))
        self.assertIsInstance(confirmed["total"], str)
        self.assertEqual(Decimal(confirmed["total"]), Decimal("3390"))

    def test_service_amounts_are_exact_text(self):
        customer = Customer.objects.create(
            display_name="Cliente",
            created_by=self.user,
            updated_by=self.user,
        )
        injector = Injector.objects.create(
            customer=customer,
            injector_number="INY-1",
            created_by=self.user,
            updated_by=self.user,
        )
        service = InjectorServiceRecord.objects.create(
            injector=injector,
            received_at=timezone.now(),
            price=Decimal("15000.0000"),
            tax_percentage=Decimal("13"),
            created_by=self.user,
            updated_by=self.user,
        )

        data = self.rendered(
            self.client.get(f"/api/customers/service-records/{service.id}/")
        )

        self.assertEqual(data["total"], "16950.00")
        self.assertEqual(data["subtotal"], "15000.00")

    def test_cash_preview_and_closing_amounts_are_text(self):
        week_start = week_start_for(timezone.localdate()) - timedelta(days=7)

        preview = self.rendered(
            self.client.get(
                "/api/cash/closings/preview/",
                {"week_start": week_start.isoformat()},
            )
        )

        for key in (
            "expected_total",
            "expected_cash",
            "petty_cash_outflows",
            "petty_cash_overdraft",
            "expected_physical_total",
        ):
            with self.subTest(key=key):
                self.assertIsInstance(preview[key], str)

        closing = CashClosing.objects.create(
            week_start=week_start,
            week_end=week_start + timedelta(days=6),
            expected_total=Decimal("1000"),
            expected_cash=Decimal("1000"),
            expected_card=0,
            expected_transfer=0,
            expected_other=0,
            petty_cash_opening=Decimal("500"),
            petty_cash_outflows=Decimal("700"),
            next_petty_cash_opening=Decimal("500"),
            counted_total=Decimal("800"),
            difference=Decimal("0"),
            created_by=self.user,
            updated_by=self.user,
        )

        data = self.rendered(self.client.get(f"/api/cash/closings/{closing.id}/"))

        self.assertEqual(data["petty_cash_overdraft"], "200.0000")
        self.assertEqual(data["expected_physical_total"], "800.0000")
        self.assertEqual(data["cash_withdrawal"], "300.0000")
