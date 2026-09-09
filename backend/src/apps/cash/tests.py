from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cash.models import CashClosing
from apps.core.models import PaymentMethod
from apps.core.permissions import ROLE_ADMIN
from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceRecord,
    InjectorServiceStatus,
)
from apps.inventory.models import Product, StorageLocation
from apps.inventory.services import initial_inventory
from apps.sales.models import Sale, SaleItem
from apps.sales.services import confirm_sale

User = get_user_model()

# La semana de prueba: un sábado fijo conocido y su viernes de cierre.
WEEK_START = date(2026, 9, 5)  # sábado
WEEK_END = WEEK_START + timedelta(days=6)  # viernes


class CashClosingApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="cash-admin",
            password="12345678",
        )

        call_command("setup_roles")

        self.user.groups.add(
            Group.objects.get(name=ROLE_ADMIN),
        )

        self.plain_user = User.objects.create_user(
            username="cash-plain",
            password="12345678",
        )

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

        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.user,
        )

        self.customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Juan Pérez",
            created_by=self.user,
            updated_by=self.user,
        )

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="0445110183",
            created_by=self.user,
            updated_by=self.user,
        )

        self.client.force_authenticate(self.user)

    def create_sale(
        self,
        sale_date,
        quantity=2,
        unit_price="1500.0000",
        payment_method=PaymentMethod.CASH,
    ):
        sale = Sale.objects.create(
            sale_date=sale_date,
            currency="CRC",
            payment_method=payment_method,
            created_by=self.user,
            updated_by=self.user,
        )

        SaleItem.objects.create(
            sale=sale,
            product=self.product,
            quantity=quantity,
            unit_price=Decimal(unit_price),
            created_by=self.user,
            updated_by=self.user,
        )

        confirm_sale(sale=sale, user=self.user)

        return sale

    # Alias por compatibilidad con el nombre usado en el resto de este
    # archivo antes de que el cierre cubriera los 4 métodos de pago.
    def create_cash_sale(self, sale_date, quantity=2, unit_price="1500.0000"):
        return self.create_sale(
            sale_date,
            quantity=quantity,
            unit_price=unit_price,
            payment_method=PaymentMethod.CASH,
        )

    def create_service(
        self,
        delivered_at,
        price="20000.0000",
        payment_method=PaymentMethod.CASH,
    ):
        return InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            delivered_at=delivered_at,
            status=InjectorServiceStatus.DELIVERED,
            payment_method=payment_method,
            price=Decimal(price),
            created_by=self.user,
            updated_by=self.user,
        )

    def create_cash_service(self, delivered_at, price="20000.0000"):
        return self.create_service(
            delivered_at,
            price=price,
            payment_method=PaymentMethod.CASH,
        )

    def test_preview_requires_authentication(self):
        self.client.force_authenticate(None)

        response = self.client.get(
            "/api/cash/closings/preview/",
            {"week_start": WEEK_START.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_preview_computes_cash_sales_and_services_total(self):
        self.create_cash_sale(WEEK_START + timedelta(days=1))
        self.create_cash_service(
            timezone.make_aware(
                datetime.combine(WEEK_START + timedelta(days=2), time.min),
            )
        )

        response = self.client.get(
            "/api/cash/closings/preview/",
            {"week_start": WEEK_START.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["week_end"], WEEK_END)
        self.assertEqual(
            Decimal(response.data["expected_cash"]),
            Decimal("23000.0000"),
        )
        self.assertEqual(
            Decimal(response.data["expected_total"]),
            Decimal("23000.0000"),
        )
        self.assertEqual(Decimal(response.data["expected_card"]), Decimal("0.0000"))
        self.assertEqual(
            Decimal(response.data["expected_transfer"]), Decimal("0.0000")
        )
        self.assertEqual(Decimal(response.data["expected_other"]), Decimal("0.0000"))

    def test_preview_breaks_down_all_payment_methods(self):
        # El negocio concilia efectivo + vouchers de tarjeta +
        # comprobantes de transferencia contra el sistema — el
        # desglose y el total deben incluir los 4 métodos, no solo
        # efectivo.
        self.create_sale(
            WEEK_START,
            unit_price="1000.0000",
            payment_method=PaymentMethod.CASH,
        )
        self.create_sale(
            WEEK_START + timedelta(days=1),
            unit_price="2000.0000",
            payment_method=PaymentMethod.CARD,
        )
        self.create_sale(
            WEEK_START + timedelta(days=2),
            unit_price="3000.0000",
            payment_method=PaymentMethod.TRANSFER,
        )
        self.create_service(
            timezone.make_aware(
                datetime.combine(WEEK_START + timedelta(days=3), time.min),
            ),
            price="4000.0000",
            payment_method=PaymentMethod.OTHER,
        )

        response = self.client.get(
            "/api/cash/closings/preview/",
            {"week_start": WEEK_START.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data["expected_cash"]), Decimal("2000.0000"))
        self.assertEqual(Decimal(response.data["expected_card"]), Decimal("4000.0000"))
        self.assertEqual(
            Decimal(response.data["expected_transfer"]), Decimal("6000.0000")
        )
        self.assertEqual(Decimal(response.data["expected_other"]), Decimal("4000.0000"))
        self.assertEqual(
            Decimal(response.data["expected_total"]), Decimal("16000.0000")
        )

    def test_preview_rejects_non_saturday_week_start(self):
        response = self.client.get(
            "/api/cash/closings/preview/",
            {"week_start": (WEEK_START + timedelta(days=1)).isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_preview_ignores_out_of_range_sales(self):
        # Venta en efectivo pero fuera del rango de la semana.
        self.create_cash_sale(WEEK_START - timedelta(days=1))

        response = self.client.get(
            "/api/cash/closings/preview/",
            {"week_start": WEEK_START.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Decimal(response.data["expected_total"]),
            Decimal("0.0000"),
        )

    def test_create_cash_closing(self):
        self.create_cash_sale(WEEK_START)

        response = self.client.post(
            "/api/cash/closings/",
            {
                "week_start": WEEK_START.isoformat(),
                "counted_total": "3000.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Decimal(response.data["expected_total"]),
            Decimal("3000.0000"),
        )
        self.assertEqual(
            Decimal(response.data["difference"]),
            Decimal("0.0000"),
        )

        closing = CashClosing.objects.get(week_start=WEEK_START)
        self.assertEqual(closing.week_end, WEEK_END)
        self.assertEqual(closing.created_by, self.user)

    def test_create_cash_closing_duplicate_week_returns_400(self):
        self.create_cash_sale(WEEK_START)

        self.client.post(
            "/api/cash/closings/",
            {
                "week_start": WEEK_START.isoformat(),
                "counted_total": "3000.0000",
            },
            format="json",
        )

        response = self.client.post(
            "/api/cash/closings/",
            {
                "week_start": WEEK_START.isoformat(),
                "counted_total": "3000.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CashClosing.objects.count(), 1)

    def test_create_cash_closing_requires_reason_when_difference(self):
        self.create_cash_sale(WEEK_START)

        response = self.client.post(
            "/api/cash/closings/",
            {
                "week_start": WEEK_START.isoformat(),
                "counted_total": "2500.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CashClosing.objects.count(), 0)

    def test_create_cash_closing_with_reason_when_difference(self):
        self.create_cash_sale(WEEK_START)

        response = self.client.post(
            "/api/cash/closings/",
            {
                "week_start": WEEK_START.isoformat(),
                "counted_total": "2500.0000",
                "difference_reason": "Faltante sin explicación clara, se investigará.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Decimal(response.data["difference"]),
            Decimal("-500.0000"),
        )

    def test_create_cash_closing_non_saturday_returns_400(self):
        response = self.client.post(
            "/api/cash/closings/",
            {
                "week_start": (WEEK_START + timedelta(days=1)).isoformat(),
                "counted_total": "0.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_cash_closings(self):
        self.create_cash_sale(WEEK_START)

        self.client.post(
            "/api/cash/closings/",
            {
                "week_start": WEEK_START.isoformat(),
                "counted_total": "3000.0000",
            },
            format="json",
        )

        response = self.client.get("/api/cash/closings/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_update_and_delete_not_allowed(self):
        self.create_cash_sale(WEEK_START)

        create_response = self.client.post(
            "/api/cash/closings/",
            {
                "week_start": WEEK_START.isoformat(),
                "counted_total": "3000.0000",
            },
            format="json",
        )
        closing_id = create_response.data["id"]

        patch_response = self.client.patch(
            f"/api/cash/closings/{closing_id}/",
            {"notes": "intento de edición"},
            format="json",
        )
        self.assertEqual(
            patch_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

        delete_response = self.client.delete(
            f"/api/cash/closings/{closing_id}/",
        )
        self.assertEqual(
            delete_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def test_user_without_cash_role_cannot_preview(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get(
            "/api/cash/closings/preview/",
            {"week_start": WEEK_START.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_without_cash_role_cannot_create_closing(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.post(
            "/api/cash/closings/",
            {
                "week_start": WEEK_START.isoformat(),
                "counted_total": "0.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
