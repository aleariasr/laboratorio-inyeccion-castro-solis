"""
Moneda y tipo de cambio de una compra por la API (auditoría de compras en
dólares, 2026-11-07). Los IDs (E1, E10, M5…) son los de la matriz de la
sección 5 de docs/auditoria-compras-monedas-2026-11-07.md.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN
from apps.inventory.models import (
    Currency,
    ImportCost,
    ImportCostCategory,
    Product,
    ProductCostHistory,
    Purchase,
    PurchaseItem,
    StorageLocation,
    Supplier,
    SupplierProduct,
)

User = get_user_model()


class PurchaseCurrencyApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        call_command("setup_roles")

        self.user.groups.add(Group.objects.get(name=ROLE_ADMIN))
        self.client.force_authenticate(self.user)

        self.location = StorageLocation.objects.create(
            code="A101",
            created_by=self.user,
            updated_by=self.user,
        )
        self.product = Product.objects.create(
            standard_code="P-001",
            name="Pieza prueba",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )
        self.supplier = Supplier.objects.create(
            name="Proveedor",
            created_by=self.user,
            updated_by=self.user,
        )
        self.supplier_product = SupplierProduct.objects.create(
            supplier=self.supplier,
            product=self.product,
            created_by=self.user,
            updated_by=self.user,
        )
        self.category = ImportCostCategory.objects.create(
            name="FLETE",
            created_by=self.user,
            updated_by=self.user,
        )

    def create_payload(self, **overrides):
        payload = {
            "supplier": self.supplier.id,
            "invoice_number": "FAC-100",
            "purchase_date": str(date.today()),
            "currency": "USD",
            "exchange_rate": "520.0000",
        }
        payload.update(overrides)

        return payload

    def make_purchase(self, currency=Currency.USD, rate="520.0000"):
        purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-001",
            purchase_date=date.today(),
            currency=currency,
            exchange_rate=Decimal(rate),
            created_by=self.user,
            updated_by=self.user,
        )
        PurchaseItem.objects.create(
            purchase=purchase,
            supplier_product=self.supplier_product,
            quantity=1,
            unit_cost=Decimal("10.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        return purchase

    def calculate(self, purchase, margin="0.0000"):
        response = self.client.post(
            f"/api/inventory/purchases/{purchase.id}/calculate-costs/",
            {"margin_percentage": margin},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        return response

    # E10 / E11 ---------------------------------------------------------

    def test_e10_dollar_purchase_rejects_unreal_exchange_rates(self):
        for rate in ("1", "1.0000", "0", "-5", "99.99", "2000.01", "99999"):
            with self.subTest(rate=rate):
                response = self.client.post(
                    "/api/inventory/purchases/",
                    self.create_payload(exchange_rate=rate),
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("exchange_rate", response.data)

        self.assertFalse(Purchase.objects.exists())

    def test_e10_dollar_purchase_requires_exchange_rate(self):
        payload = self.create_payload()
        del payload["exchange_rate"]

        response = self.client.post(
            "/api/inventory/purchases/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exchange_rate", response.data)

    def test_dollar_purchase_accepts_a_real_exchange_rate(self):
        response = self.client.post(
            "/api/inventory/purchases/",
            self.create_payload(exchange_rate="519.8750"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Purchase.objects.get().exchange_rate,
            Decimal("519.8750"),
        )

    def test_e11_colones_purchase_always_stores_exchange_rate_one(self):
        response = self.client.post(
            "/api/inventory/purchases/",
            self.create_payload(currency="CRC", exchange_rate="520.0000"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Purchase.objects.get().exchange_rate, Decimal("1"))

    def test_colones_purchase_does_not_need_exchange_rate(self):
        payload = self.create_payload(currency="CRC")
        del payload["exchange_rate"]

        response = self.client.post(
            "/api/inventory/purchases/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_draft_saved_with_exchange_rate_one_must_fix_it_to_be_edited(self):
        # Un borrador que quedó en dólares con 1 (antes de la corrección)
        # no se guarda de nuevo hasta poner el tipo de cambio real.
        purchase = self.make_purchase(rate="1.0000")

        response = self.client.patch(
            f"/api/inventory/purchases/{purchase.id}/",
            {"notes": "Revisada"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exchange_rate", response.data)

        summary_response = self.client.get(
            f"/api/inventory/purchases/{purchase.id}/cost-summary/",
            {"margin_percentage": "30"},
        )

        self.assertEqual(summary_response.status_code, status.HTTP_400_BAD_REQUEST)

    # E1 / M5 / M6 ------------------------------------------------------

    def test_e1_changing_the_exchange_rate_discards_the_calculation(self):
        purchase = self.make_purchase()
        self.calculate(purchase)

        response = self.client.patch(
            f"/api/inventory/purchases/{purchase.id}/",
            {"exchange_rate": "530.0000"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(ProductCostHistory.objects.exists())

        # Recalcular da el precio con el tipo de cambio nuevo: US$10 × 530.
        recalculated = self.calculate(purchase)

        self.assertEqual(
            Decimal(recalculated.data[0]["final_unit_cost"]),
            Decimal("5300.0000"),
        )

    def test_saving_without_changing_currency_or_rate_keeps_the_calculation(self):
        purchase = self.make_purchase()
        self.calculate(purchase)

        response = self.client.patch(
            f"/api/inventory/purchases/{purchase.id}/",
            {"notes": "Sin cambios de moneda", "exchange_rate": "520"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(ProductCostHistory.objects.count(), 1)

    def test_m5_colones_draft_with_dollar_cost_switched_to_dollars(self):
        # El costo en dólares guarda su propio tipo de cambio (515), que no
        # depende de la moneda de la compra: sigue siendo válido.
        purchase = self.make_purchase(currency=Currency.CRC, rate="1")
        ImportCost.objects.create(
            purchase=purchase,
            category=self.category,
            amount=Decimal("2.0000"),
            currency=Currency.USD,
            exchange_rate=Decimal("515.0000"),
            created_by=self.user,
            updated_by=self.user,
        )
        PurchaseItem.objects.filter(purchase=purchase).update(
            unit_cost=Decimal("5200.0000"),
        )
        self.calculate(purchase)

        response = self.client.patch(
            f"/api/inventory/purchases/{purchase.id}/",
            {"currency": "USD", "exchange_rate": "520.0000"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(ProductCostHistory.objects.exists())

        # La línea quedó en US$5 200 (el usuario corrige el monto después);
        # lo que importa aquí es el costo: US$2 × 515 = ₡1 030.
        summary = self.client.get(
            f"/api/inventory/purchases/{purchase.id}/cost-summary/",
            {"margin_percentage": "0"},
        )

        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Decimal(summary.data["import_costs_total"]),
            Decimal("1030.0000"),
        )

    def test_m6_dollar_draft_with_colones_cost_switched_to_colones(self):
        purchase = self.make_purchase()
        ImportCost.objects.create(
            purchase=purchase,
            category=self.category,
            amount=Decimal("5000.0000"),
            currency=Currency.CRC,
            exchange_rate=Decimal("1.0000"),
            created_by=self.user,
            updated_by=self.user,
        )
        self.calculate(purchase)

        response = self.client.patch(
            f"/api/inventory/purchases/{purchase.id}/",
            {"currency": "CRC"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(ProductCostHistory.objects.exists())

        purchase.refresh_from_db()

        self.assertEqual(purchase.exchange_rate, Decimal("1"))

        # ₡10 de línea + ₡5 000 de costo: el costo no se convierte.
        summary = self.client.get(
            f"/api/inventory/purchases/{purchase.id}/cost-summary/",
            {"margin_percentage": "0"},
        )

        self.assertEqual(
            Decimal(summary.data["import_costs_total"]),
            Decimal("5000.0000"),
        )

    # Estados -----------------------------------------------------------

    def test_cancelled_purchase_cannot_be_calculated(self):
        purchase = self.make_purchase()

        self.client.post(
            f"/api/inventory/purchases/{purchase.id}/cancel/",
            {"reason": "Prueba."},
            format="json",
        )

        response = self.client.post(
            f"/api/inventory/purchases/{purchase.id}/calculate-costs/",
            {"margin_percentage": "30"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ProductCostHistory.objects.exists())

    def test_has_cost_calculation_tells_whether_costs_were_applied(self):
        purchase = self.make_purchase()

        detail = self.client.get(f"/api/inventory/purchases/{purchase.id}/")
        self.assertFalse(detail.data["has_cost_calculation"])

        self.calculate(purchase)

        detail = self.client.get(f"/api/inventory/purchases/{purchase.id}/")
        listing = self.client.get("/api/inventory/purchases/")

        self.assertTrue(detail.data["has_cost_calculation"])
        self.assertTrue(listing.data["results"][0]["has_cost_calculation"])

    def test_cost_summary_returns_colones_with_the_original_amounts(self):
        purchase = self.make_purchase()

        response = self.client.get(
            f"/api/inventory/purchases/{purchase.id}/cost-summary/",
            {"margin_percentage": "30"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        line = response.data["items"][0]

        # US$10 × 520 = ₡5 200 → × 1,3 = ₡6 760.
        self.assertEqual(response.data["currency"], "USD")
        self.assertEqual(Decimal(response.data["invoice_subtotal_original"]), Decimal("10"))
        self.assertEqual(Decimal(response.data["invoice_subtotal"]), Decimal("5200"))
        self.assertEqual(Decimal(line["original_unit_cost"]), Decimal("10"))
        self.assertEqual(Decimal(line["original_unit_cost_crc"]), Decimal("5200"))
        self.assertEqual(Decimal(line["final_unit_cost"]), Decimal("5200"))
        self.assertEqual(Decimal(line["suggested_price"]), Decimal("6760"))

    # Recorrido completo del 2026-11-07 ---------------------------------

    def test_cost_summary_amounts_are_exact_strings(self):
        # Antes iban como números de punto flotante en el JSON.
        purchase = self.make_purchase()

        response = self.client.get(
            f"/api/inventory/purchases/{purchase.id}/cost-summary/",
            {"margin_percentage": "30"},
        )

        self.assertIsInstance(response.data["invoice_subtotal"], str)
        self.assertIsInstance(response.data["cost_factor"], str)
        self.assertIsInstance(response.data["items"][0]["suggested_price"], str)
        self.assertEqual(response.data["items"][0]["quantity"], 1)
        self.assertEqual(response.data["items"][0]["suggested_price"], "6760.00")

    def test_line_product_cannot_change(self):
        # Antes respondía 200 y el producto quedaba igual, sin aviso.
        purchase = self.make_purchase()
        line = purchase.items.get()
        other_product = Product.objects.create(
            standard_code="P-002",
            name="Otra pieza",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/purchase-items/{line.id}/",
            {"product": other_product.id, "quantity": 3},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("product", response.data)

        line.refresh_from_db()

        self.assertEqual(line.quantity, 1)

    def test_line_can_be_saved_with_its_own_product(self):
        purchase = self.make_purchase()
        line = purchase.items.get()

        response = self.client.patch(
            f"/api/inventory/purchase-items/{line.id}/",
            {"product": self.product.id, "quantity": 3},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_purchase_supplier_cannot_change(self):
        # Las líneas quedaban con productos del proveedor anterior.
        purchase = self.make_purchase()
        other_supplier = Supplier.objects.create(
            name="Otro proveedor",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/purchases/{purchase.id}/",
            {"supplier": other_supplier.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("supplier", response.data)

        purchase.refresh_from_db()

        self.assertEqual(purchase.supplier, self.supplier)

    def test_full_edit_with_the_same_supplier_is_accepted(self):
        purchase = self.make_purchase()

        response = self.client.put(
            f"/api/inventory/purchases/{purchase.id}/",
            {
                "supplier": self.supplier.id,
                "invoice_number": purchase.invoice_number,
                "purchase_date": str(purchase.purchase_date),
                "currency": "USD",
                "exchange_rate": "521.0000",
                "notes": "",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
