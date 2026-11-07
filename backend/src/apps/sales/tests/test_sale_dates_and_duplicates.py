"""
Auditoría integral del 2026-11-07:

- P1: una venta no se confirma con fecha de una semana de caja ya cerrada
  (quedaba fuera de todo cierre).
- P3: la fecha de venta no puede ser futura.
- P2: anular una venta de una semana cerrada sí se permite; la API avisa con
  in_closed_cash_week para que la pantalla lo diga.
- El producto repetido en una venta responde con un mensaje claro, no con
  "Los campos sale, product deben formar un conjunto único.".
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cash.models import CashClosing
from apps.cash.selectors import week_start_for
from apps.core.permissions import ROLE_ADMIN
from apps.inventory.models import Product, StockMovement, StorageLocation
from apps.inventory.selectors import current_stock
from apps.inventory.services import initial_inventory
from apps.sales.models import Sale, SaleItem, SaleStatus
from apps.sales.services import confirm_sale

User = get_user_model()


class SaleDateRulesTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.user = User.objects.create_user(
            username="sale-dates-admin",
            password="12345678",
        )
        self.user.groups.add(Group.objects.get(name=ROLE_ADMIN))
        self.client.force_authenticate(self.user)

        location = StorageLocation.objects.create(
            code="A101",
            created_by=self.user,
            updated_by=self.user,
        )
        self.product = Product.objects.create(
            standard_code="P-001",
            name="Producto prueba",
            storage_location=location,
            custom_sale_price=Decimal("1000.0000"),
            created_by=self.user,
            updated_by=self.user,
        )
        self.other_product = Product.objects.create(
            standard_code="P-002",
            name="Otro producto",
            storage_location=location,
            custom_sale_price=Decimal("500.0000"),
            created_by=self.user,
            updated_by=self.user,
        )
        initial_inventory(product=self.product, quantity=20, user=self.user)
        initial_inventory(product=self.other_product, quantity=20, user=self.user)

        self.today = timezone.localdate()
        # Una semana ya terminada: la anterior a la semana en curso.
        self.closed_week_start = week_start_for(self.today) - timedelta(days=7)
        self.closed_day = self.closed_week_start + timedelta(days=2)

    def close_week(self, week_start):
        return CashClosing.objects.create(
            week_start=week_start,
            week_end=week_start + timedelta(days=6),
            expected_total=0,
            expected_cash=0,
            expected_card=0,
            expected_transfer=0,
            expected_other=0,
            counted_total=0,
            difference=0,
            created_by=self.user,
            updated_by=self.user,
        )

    def draft_sale(self, sale_date):
        sale = Sale.objects.create(
            sale_date=sale_date,
            created_by=self.user,
            updated_by=self.user,
        )
        SaleItem.objects.create(
            sale=sale,
            product=self.product,
            quantity=2,
            unit_price=Decimal("1000.0000"),
            created_by=self.user,
            updated_by=self.user,
        )
        return sale

    # --- P1: semana cerrada ---------------------------------------------

    def test_confirm_sale_in_closed_week_is_rejected_and_moves_nothing(self):
        sale = self.draft_sale(self.closed_day)
        self.close_week(self.closed_week_start)
        movements_before = StockMovement.objects.count()

        response = self.client.post(f"/api/sales/sales/{sale.id}/confirm/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ya tiene cierre de caja", response.data["detail"])
        sale.refresh_from_db()
        self.assertEqual(sale.status, SaleStatus.DRAFT)
        self.assertIsNone(sale.total_amount)
        self.assertEqual(StockMovement.objects.count(), movements_before)
        self.assertEqual(current_stock(self.product), 20)

    def test_confirm_sale_in_open_past_week_still_works(self):
        sale = self.draft_sale(self.closed_day)

        response = self.client.post(f"/api/sales/sales/{sale.id}/confirm/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(current_stock(self.product), 18)

    def test_create_sale_with_closed_week_date_is_rejected(self):
        self.close_week(self.closed_week_start)

        response = self.client.post(
            "/api/sales/sales/",
            {"sale_date": self.closed_day.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sale_date", response.data)

    def test_moving_a_draft_into_a_closed_week_is_rejected(self):
        self.close_week(self.closed_week_start)
        sale = self.draft_sale(self.today)

        response = self.client.patch(
            f"/api/sales/sales/{sale.id}/",
            {"sale_date": self.closed_day.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sale_date", response.data)

    def test_editing_other_fields_of_a_draft_does_not_revalidate_its_date(self):
        sale = self.draft_sale(self.closed_day)
        self.close_week(self.closed_week_start)

        response = self.client.patch(
            f"/api/sales/sales/{sale.id}/",
            {"notes": "Solo la nota"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # --- P3: fecha futura -----------------------------------------------

    def test_create_sale_with_future_date_is_rejected(self):
        response = self.client.post(
            "/api/sales/sales/",
            {"sale_date": (self.today + timedelta(days=1)).isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["sale_date"],
            ["La fecha de la venta no puede ser futura."],
        )

    def test_create_sale_today_is_allowed(self):
        response = self.client.post(
            "/api/sales/sales/",
            {"sale_date": self.today.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_confirm_sale_with_future_date_is_rejected(self):
        # Por ejemplo, un borrador creado antes de esta regla.
        sale = self.draft_sale(self.today + timedelta(days=3))

        response = self.client.post(f"/api/sales/sales/{sale.id}/confirm/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "La fecha de la venta no puede ser futura.",
        )

    # --- P2: anular en semana cerrada -----------------------------------

    def test_cancel_sale_of_closed_week_is_allowed_and_flagged(self):
        sale = self.draft_sale(self.closed_day)
        confirm_sale(sale=sale, user=self.user)
        self.close_week(self.closed_week_start)

        detail = self.client.get(f"/api/sales/sales/{sale.id}/")
        self.assertTrue(detail.data["in_closed_cash_week"])

        response = self.client.post(
            f"/api/sales/sales/{sale.id}/cancel/",
            {"reason": "Devolución"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], SaleStatus.CANCELLED)
        self.assertEqual(current_stock(self.product), 20)

    def test_sale_of_open_week_is_not_flagged(self):
        sale = self.draft_sale(self.today)

        response = self.client.get(f"/api/sales/sales/{sale.id}/")

        self.assertFalse(response.data["in_closed_cash_week"])

    # --- Producto repetido ----------------------------------------------

    def test_repeated_product_in_a_draft_gives_a_clear_message(self):
        sale = self.draft_sale(self.today)

        response = self.client.post(
            "/api/sales/sale-items/",
            {"sale": sale.id, "product": self.product.id, "quantity": 1},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["product"],
            ["Ese producto ya está en la venta; se cambia la cantidad de su línea."],
        )

    def test_repeated_product_in_a_confirmed_sale_says_it_is_confirmed(self):
        sale = self.draft_sale(self.today)
        confirm_sale(sale=sale, user=self.user)

        response = self.client.post(
            "/api/sales/sale-items/",
            {"sale": sale.id, "product": self.product.id, "quantity": 1},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["non_field_errors"],
            ["Solo se pueden modificar líneas de ventas en borrador."],
        )

    def test_changing_a_line_to_a_product_already_in_the_sale_is_rejected(self):
        sale = self.draft_sale(self.today)
        other_line = SaleItem.objects.create(
            sale=sale,
            product=self.other_product,
            quantity=1,
            unit_price=Decimal("500.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/sales/sale-items/{other_line.id}/",
            {"product": self.product.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("product", response.data)

    def test_updating_the_quantity_of_a_line_still_works(self):
        sale = self.draft_sale(self.today)
        line = sale.items.get()

        response = self.client.patch(
            f"/api/sales/sale-items/{line.id}/",
            {"quantity": 3},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["quantity"], 3)
