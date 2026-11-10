"""
Un mismo producto en varias líneas de una factura (pedido del cliente del
2026-11-10: mercadería del mismo proveedor despachada desde dos bodegas, a
precios distintos).

Reglas que se prueban:
- cada línea entra al inventario y se revierte por separado;
- cada línea tiene su costo final, con los costos de importación
  prorrateados igual que siempre;
- el producto tiene un solo precio, que sale del costo promedio ponderado
  por cantidad de sus líneas;
- la referencia es opcional y no entra en el cálculo.

Los montos esperados se calculan a mano en cada test.
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
    MovementDirection,
    Product,
    ProductCostHistory,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
    StockMovement,
    StockMovementType,
    StorageLocation,
    Supplier,
)
from apps.inventory.selectors import current_stock, latest_suggested_price
from apps.inventory.services import adjust_stock

User = get_user_model()


class RepeatedProductInPurchaseTest(APITestCase):
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
        self.product_a = Product.objects.create(
            standard_code="P-A",
            name="Producto A",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )
        self.product_b = Product.objects.create(
            standard_code="P-B",
            name="Producto B",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )
        self.supplier = Supplier.objects.create(
            name="Proveedor",
            created_by=self.user,
            updated_by=self.user,
        )
        self.category = ImportCostCategory.objects.create(
            name="FLETE",
            created_by=self.user,
            updated_by=self.user,
        )

    # Ayudas ------------------------------------------------------------

    def make_purchase(self, currency=Currency.CRC, rate="1"):
        response = self.client.post(
            "/api/inventory/purchases/",
            {
                "supplier": self.supplier.id,
                "invoice_number": f"FAC-{Purchase.objects.count() + 1}",
                "purchase_date": str(date.today()),
                "currency": currency,
                "exchange_rate": rate,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        return Purchase.objects.get(id=response.data["id"])

    def add_line(self, purchase, product, quantity, unit_cost, reference=""):
        response = self.client.post(
            "/api/inventory/purchase-items/",
            {
                "purchase": purchase.id,
                "product": product.id,
                "quantity": quantity,
                "unit_cost": unit_cost,
                "reference": reference,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        return PurchaseItem.objects.get(id=response.data["id"])

    def summary(self, purchase, margin="30"):
        response = self.client.get(
            f"/api/inventory/purchases/{purchase.id}/cost-summary/",
            {"margin_percentage": margin},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        return response.data

    def calculate(self, purchase, margin="30"):
        response = self.client.post(
            f"/api/inventory/purchases/{purchase.id}/calculate-costs/",
            {"margin_percentage": margin},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        return response.data

    def confirm(self, purchase):
        response = self.client.post(
            f"/api/inventory/purchases/{purchase.id}/confirm/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def two_warehouses_in_colones(self):
        # A: 3 u. a ₡10 000 (Bodega 1) y 1 u. a ₡14 000 (Bodega 2); B: 2 u. a ₡5 000.
        purchase = self.make_purchase()
        line_1 = self.add_line(purchase, self.product_a, 3, "10000", "Bodega 1")
        line_2 = self.add_line(purchase, self.product_a, 1, "14000", "Bodega 2")
        self.add_line(purchase, self.product_b, 2, "5000")

        return purchase, line_1, line_2

    # Cálculo -----------------------------------------------------------

    def test_repeated_product_price_uses_the_weighted_average_cost(self):
        purchase, line_1, line_2 = self.two_warehouses_in_colones()

        data = self.summary(purchase)

        # Sin costos de importación el factor es 1.
        # A: (3 × 10 000 + 1 × 14 000) / 4 = ₡11 000 → × 1,3 = ₡14 300.
        # B: ₡5 000 → × 1,3 = ₡6 500.
        lines = {line["id"]: line for line in data["items"]}

        self.assertEqual(len(data["items"]), 3)
        self.assertEqual(Decimal(lines[line_1.id]["final_unit_cost"]), Decimal("10000"))
        self.assertEqual(Decimal(lines[line_2.id]["final_unit_cost"]), Decimal("14000"))
        self.assertEqual(Decimal(lines[line_1.id]["suggested_price"]), Decimal("14300"))
        self.assertEqual(Decimal(lines[line_2.id]["suggested_price"]), Decimal("14300"))
        self.assertTrue(lines[line_1.id]["is_repeated"])
        self.assertEqual(lines[line_2.id]["reference"], "Bodega 2")

        products = {line["product"]: line for line in data["products"]}

        self.assertEqual(len(data["products"]), 2)
        self.assertEqual(products[self.product_a.id]["quantity"], 4)
        self.assertEqual(products[self.product_a.id]["line_count"], 2)
        self.assertEqual(Decimal(products[self.product_a.id]["original_unit_cost"]), Decimal("11000"))
        self.assertEqual(Decimal(products[self.product_a.id]["final_unit_cost"]), Decimal("11000"))
        self.assertEqual(Decimal(products[self.product_a.id]["suggested_price"]), Decimal("14300"))
        self.assertEqual(Decimal(products[self.product_b.id]["suggested_price"]), Decimal("6500"))
        self.assertEqual(products[self.product_b.id]["line_count"], 1)

    def test_repeated_product_in_dollars_with_colones_import_cost(self):
        # Compra a ₡520: A 3 u. a US$10 y 1 u. a US$14; flete de ₡5 200.
        purchase = self.make_purchase(Currency.USD, "520")
        line_1 = self.add_line(purchase, self.product_a, 3, "10", "Bodega 1")
        line_2 = self.add_line(purchase, self.product_a, 1, "14", "Bodega 2")
        ImportCost.objects.create(
            purchase=purchase,
            category=self.category,
            amount=Decimal("5200"),
            currency=Currency.CRC,
            exchange_rate=Decimal("1"),
            created_by=self.user,
            updated_by=self.user,
        )

        data = self.summary(purchase)

        # Subtotal US$44 × 520 = ₡22 880; factor (22 880 + 5 200) / 22 880
        # = 1,2272727… → 1,227273.
        # Línea 1: 10 × 520 × 1,227273 = ₡6 381,8196.
        # Línea 2: 14 × 520 × 1,227273 = ₡8 934,5474.
        # Producto: promedio US$11 × 520 × 1,227273 = ₡7 020,0016 → × 1,3
        # = ₡9 126,00208 → ₡9 126,00.
        lines = {line["id"]: line for line in data["items"]}

        self.assertEqual(Decimal(data["cost_factor"]), Decimal("1.227273"))
        self.assertEqual(Decimal(lines[line_1.id]["final_unit_cost"]), Decimal("6381.8196"))
        self.assertEqual(Decimal(lines[line_2.id]["final_unit_cost"]), Decimal("8934.5474"))
        self.assertEqual(data["products"][0]["final_unit_cost"], "7020.0016")
        self.assertEqual(data["products"][0]["suggested_price"], "9126.00")

        histories = self.calculate(purchase)

        # Una fila por producto, con el costo promedio.
        self.assertEqual(len(histories), 1)
        self.assertEqual(ProductCostHistory.objects.filter(purchase=purchase).count(), 1)

        history = ProductCostHistory.objects.get(purchase=purchase)

        self.assertEqual(history.original_unit_cost, Decimal("11.0000"))
        self.assertEqual(history.final_unit_cost, Decimal("7020.0016"))
        self.assertEqual(history.suggested_price, Decimal("9126.00"))

        self.confirm(purchase)

        self.assertEqual(latest_suggested_price(self.product_a), Decimal("9126.00"))

    def test_single_line_products_keep_the_same_result_as_before(self):
        # Sin repetidos, el promedio de un producto es su propio costo.
        purchase = self.make_purchase(Currency.USD, "519.8750")
        self.add_line(purchase, self.product_a, 1000, "0.15")

        data = self.summary(purchase)

        # US$0,15 × 519,875 = ₡77,98125 → ₡77,9813; × 1,3 = ₡101,37569
        # → ₡101,38.
        self.assertFalse(data["items"][0]["is_repeated"])
        self.assertEqual(data["items"][0]["final_unit_cost"], "77.9813")
        self.assertEqual(data["products"][0]["final_unit_cost"], "77.9813")
        self.assertEqual(data["items"][0]["suggested_price"], "101.38")

    # Inventario --------------------------------------------------------

    def test_each_line_enters_inventory(self):
        purchase, line_1, line_2 = self.two_warehouses_in_colones()

        self.confirm(purchase)

        self.assertEqual(current_stock(self.product_a), 4)
        self.assertEqual(
            StockMovement.objects.filter(
                product=self.product_a,
                movement_type=StockMovementType.ENTRY,
            ).count(),
            2,
        )

    def test_cancel_reverses_every_line(self):
        purchase, _, _ = self.two_warehouses_in_colones()
        self.confirm(purchase)

        response = self.client.post(
            f"/api/inventory/purchases/{purchase.id}/cancel/",
            {"reason": "Factura equivocada."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(current_stock(self.product_a), 0)
        self.assertEqual(current_stock(self.product_b), 0)
        self.assertEqual(
            StockMovement.objects.filter(
                product=self.product_a,
                movement_type=StockMovementType.REVERSAL,
                direction=MovementDirection.OUT,
            ).count(),
            2,
        )

    def test_cancel_checks_stock_against_all_lines_of_the_product(self):
        # Entraron 4 de A (3 + 1) y salió 1: quedan 3. Cada línea por
        # separado cabe (3 ≥ 3 y 3 ≥ 1), pero las dos juntas no (3 < 4):
        # comparar línea por línea dejaba el stock en −1.
        purchase, _, _ = self.two_warehouses_in_colones()
        self.confirm(purchase)
        adjust_stock(product=self.product_a, quantity=-1, user=self.user, notes="Venta")

        response = self.client.post(
            f"/api/inventory/purchases/{purchase.id}/cancel/",
            {"reason": "Factura equivocada."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(current_stock(self.product_a), 3)

        purchase.refresh_from_db()

        self.assertEqual(purchase.status, PurchaseStatus.CONFIRMED)

    # Edición -----------------------------------------------------------

    def test_deleting_one_repeated_line_discards_the_calculation(self):
        purchase, line_1, line_2 = self.two_warehouses_in_colones()
        self.calculate(purchase)

        response = self.client.delete(f"/api/inventory/purchase-items/{line_2.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProductCostHistory.objects.filter(purchase=purchase).exists())

        data = self.summary(purchase)
        line = next(item for item in data["items"] if item["id"] == line_1.id)

        # Queda una sola línea de A: deja de ser repetido, ₡10 000 × 1,3.
        self.assertFalse(line["is_repeated"])
        self.assertEqual(Decimal(line["suggested_price"]), Decimal("13000"))

    def test_changing_only_the_reference_keeps_the_calculation(self):
        purchase, line_1, _ = self.two_warehouses_in_colones()
        self.calculate(purchase)

        response = self.client.patch(
            f"/api/inventory/purchase-items/{line_1.id}/",
            {"reference": "Bodega central"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["reference"], "Bodega central")
        self.assertEqual(ProductCostHistory.objects.filter(purchase=purchase).count(), 2)

    def test_changing_the_quantity_of_a_repeated_line_discards_the_calculation(self):
        purchase, line_1, _ = self.two_warehouses_in_colones()
        self.calculate(purchase)

        response = self.client.patch(
            f"/api/inventory/purchase-items/{line_1.id}/",
            {"quantity": 1},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(ProductCostHistory.objects.filter(purchase=purchase).exists())

        # A: (1 × 10 000 + 1 × 14 000) / 2 = ₡12 000 → × 1,3 = ₡15 600.
        data = self.summary(purchase)
        product_a = next(p for p in data["products"] if p["product"] == self.product_a.id)

        self.assertEqual(Decimal(product_a["suggested_price"]), Decimal("15600"))

    def test_reference_is_optional_and_limited(self):
        purchase = self.make_purchase()

        line = self.add_line(purchase, self.product_a, 1, "1000")

        self.assertEqual(line.reference, "")

        response = self.client.post(
            "/api/inventory/purchase-items/",
            {
                "purchase": purchase.id,
                "product": self.product_a.id,
                "quantity": 1,
                "unit_cost": "1000",
                "reference": "x" * 101,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("reference", response.data)

    def test_purchase_detail_lists_each_line_with_its_reference(self):
        purchase, line_1, line_2 = self.two_warehouses_in_colones()

        response = self.client.get(f"/api/inventory/purchases/{purchase.id}/")

        references = [item["reference"] for item in response.data["items"]]

        self.assertEqual(references, ["Bodega 1", "Bodega 2", ""])

    # Reporte -----------------------------------------------------------

    def test_supplier_prices_report_counts_one_purchase_with_both_lines(self):
        purchase, line_1, line_2 = self.two_warehouses_in_colones()
        self.confirm(purchase)

        response = self.client.get(
            "/api/reports/product-supplier-prices/",
            {"product": self.product_a.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        entry = response.data["results"][0]

        # Una factura, dos precios: promedio simple de los precios pagados
        # (10 000 + 14 000) / 2 = ₡12 000.
        self.assertEqual(entry["purchase_count"], 1)
        self.assertEqual(len(entry["purchases"]), 2)
        self.assertEqual(Decimal(entry["average_unit_cost"]), Decimal("12000"))
        self.assertEqual(
            [line["reference"] for line in entry["purchases"]],
            ["Bodega 1", "Bodega 2"],
        )
        self.assertEqual(
            [line["item_id"] for line in entry["purchases"]],
            [line_1.id, line_2.id],
        )
