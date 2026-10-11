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
    PurchaseStatus,
    StorageLocation,
    Supplier,
    SupplierProduct,
)

User = get_user_model()


class ImportCostApiTest(APITestCase):
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

        self.supplier = Supplier.objects.create(
            name="Proveedor prueba",
            created_by=self.user,
            updated_by=self.user,
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

        self.supplier_product = SupplierProduct.objects.create(
            supplier=self.supplier,
            product=self.product,
            manufacturer="Bosch",
            created_by=self.user,
            updated_by=self.user,
        )

        self.purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-001",
            purchase_date=date.today(),
            currency=Currency.USD,
            exchange_rate="500.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        self.purchase_item = PurchaseItem.objects.create(
            purchase=self.purchase,
            supplier_product=self.supplier_product,
            quantity=1,
            unit_cost="100.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        self.category = ImportCostCategory.objects.create(
            name="FLETES",
            description="Costos de transporte",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_create_import_cost_category(self):
        response = self.client.post(
            "/api/inventory/import-cost-categories/",
            {
                "name": "impuestos",
                "description": "Impuestos de importación",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        category = ImportCostCategory.objects.get(
            id=response.data["id"],
        )

        self.assertEqual(category.name, "IMPUESTOS")
        self.assertEqual(
            category.description,
            "Impuestos de importación",
        )
        self.assertEqual(category.created_by, self.user)
        self.assertEqual(category.updated_by, self.user)

    def test_duplicate_import_cost_category_returns_400(self):
        response = self.client.post(
            "/api/inventory/import-cost-categories/",
            {
                "name": "fletes",
                "description": "Duplicado",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(
            ImportCostCategory.objects.filter(name="FLETES").count(),
            1,
        )

    def test_list_import_cost_categories(self):
        response = self.client.get(
            "/api/inventory/import-cost-categories/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

        self.assertEqual(response.data["results"][0]["name"], "FLETES")

    def test_filter_import_cost_categories_by_search_query(self):
        ImportCostCategory.objects.create(
            name="SEGUROS",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/import-cost-categories/",
            {"q": "flet"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "FLETES")

    def test_filter_import_cost_categories_by_is_active(self):
        self.category.is_active = False
        self.category.save(update_fields=["is_active"])

        response = self.client.get(
            "/api/inventory/import-cost-categories/",
            {"is_active": "false"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

        response = self.client.get(
            "/api/inventory/import-cost-categories/",
            {"is_active": "true"},
        )

        self.assertEqual(response.data["count"], 0)

    def test_create_import_cost(self):
        response = self.client.post(
            "/api/inventory/import-costs/",
            {
                "purchase": self.purchase.id,
                "category": self.category.id,
                "description": "Flete marítimo",
                "amount": "125.5000",
                "currency": Currency.USD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        import_cost = ImportCost.objects.get(
            id=response.data["id"],
        )

        self.assertEqual(import_cost.purchase, self.purchase)
        self.assertEqual(import_cost.category, self.category)
        self.assertEqual(import_cost.description, "Flete marítimo")
        self.assertEqual(str(import_cost.amount), "125.5000")
        self.assertEqual(import_cost.currency, Currency.USD)
        self.assertEqual(import_cost.created_by, self.user)
        self.assertEqual(import_cost.updated_by, self.user)

    def test_list_import_costs(self):
        ImportCost.objects.create(
            purchase=self.purchase,
            category=self.category,
            description="Flete marítimo",
            amount="125.5000",
            currency=Currency.USD,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/import-costs/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

        item = response.data["results"][0]

        self.assertEqual(item["purchase"], self.purchase.id)
        self.assertEqual(item["category"], self.category.id)
        self.assertEqual(item["category_detail"]["name"], "FLETES")
        self.assertEqual(
            item["purchase_detail"]["invoice_number"],
            "FAC-001",
        )

    def test_filter_import_costs_by_purchase(self):
        other_purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-002",
            purchase_date=date.today(),
            currency=Currency.USD,
            exchange_rate="500.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        other_category = ImportCostCategory.objects.create(
            name="SEGUROS",
            created_by=self.user,
            updated_by=self.user,
        )

        ImportCost.objects.create(
            purchase=self.purchase,
            category=self.category,
            amount="125.5000",
            currency=Currency.USD,
            created_by=self.user,
            updated_by=self.user,
        )

        ImportCost.objects.create(
            purchase=other_purchase,
            category=other_category,
            amount="25.0000",
            currency=Currency.USD,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/import-costs/",
            {
                "purchase": self.purchase.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["purchase"], self.purchase.id)

    def test_update_import_cost(self):
        import_cost = ImportCost.objects.create(
            purchase=self.purchase,
            category=self.category,
            amount="125.5000",
            currency=Currency.USD,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/import-costs/{import_cost.id}/",
            {
                "description": "Flete actualizado",
                "amount": "130.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        import_cost.refresh_from_db()

        self.assertEqual(import_cost.description, "Flete actualizado")
        self.assertEqual(str(import_cost.amount), "130.0000")
        self.assertEqual(import_cost.updated_by, self.user)

    def test_import_cost_amount_must_be_positive(self):
        response = self.client.post(
            "/api/inventory/import-costs/",
            {
                "purchase": self.purchase.id,
                "category": self.category.id,
                "amount": "0.0000",
                "currency": Currency.USD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_import_cost_requires_exchange_rate_one_when_currency_matches_purchase(self):
        response = self.client.post(
            "/api/inventory/import-costs/",
            {
                "purchase": self.purchase.id,
                "category": self.category.id,
                "amount": "100.0000",
                "currency": Currency.USD,
                "exchange_rate": "1.5000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exchange_rate", response.data)

    def test_import_cost_allows_different_currency_with_custom_exchange_rate(self):
        response = self.client.post(
            "/api/inventory/import-costs/",
            {
                "purchase": self.purchase.id,
                "category": self.category.id,
                "amount": "5000.0000",
                "currency": Currency.CRC,
                "exchange_rate": "500.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        import_cost = ImportCost.objects.get(id=response.data["id"])

        self.assertEqual(import_cost.exchange_rate, Decimal("500.0000"))

    def test_import_cost_rejects_exchange_rate_one_when_currency_differs(self):
        response = self.client.post(
            "/api/inventory/import-costs/",
            {
                "purchase": self.purchase.id,
                "category": self.category.id,
                "amount": "5000.0000",
                "currency": Currency.CRC,
                "exchange_rate": "1.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exchange_rate", response.data)

    def test_purchase_cost_summary_converts_import_costs_by_exchange_rate(self):
        usd_purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-USD",
            purchase_date=date.today(),
            currency=Currency.USD,
            exchange_rate="1.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        PurchaseItem.objects.create(
            purchase=usd_purchase,
            supplier_product=self.supplier_product,
            quantity=1,
            unit_cost="100.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        ImportCost.objects.create(
            purchase=usd_purchase,
            category=self.category,
            amount="5000.0000",
            currency=Currency.CRC,
            exchange_rate="500.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            f"/api/inventory/purchases/{usd_purchase.id}/cost-summary/",
            {
                "margin_percentage": "0.0000",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Decimal(response.data["import_costs_total"]),
            Decimal("10.0000"),
        )
        self.assertEqual(
            Decimal(response.data["total_cost"]),
            Decimal("110.0000"),
        )

    def create_import_cost(self, amount="50.0000"):
        return ImportCost.objects.create(
            purchase=self.purchase,
            category=self.category,
            amount=amount,
            currency=Currency.USD,
            exchange_rate="1.0000",
            created_by=self.user,
            updated_by=self.user,
        )

    def calculate_costs(self, margin="30.0000"):
        response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/calculate-costs/",
            {
                "margin_percentage": margin,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        return response

    def test_create_import_cost_discards_cost_calculation(self):
        self.calculate_costs()

        self.assertEqual(ProductCostHistory.objects.count(), 1)

        response = self.client.post(
            "/api/inventory/import-costs/",
            {
                "purchase": self.purchase.id,
                "category": self.category.id,
                "amount": "25.0000",
                "currency": Currency.USD,
                "exchange_rate": "1.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            ProductCostHistory.objects.filter(purchase=self.purchase).count(),
            0,
        )

    def test_update_import_cost_discards_cost_calculation(self):
        import_cost = self.create_import_cost()

        self.calculate_costs()

        response = self.client.patch(
            f"/api/inventory/import-costs/{import_cost.id}/",
            {
                "amount": "80.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            ProductCostHistory.objects.filter(purchase=self.purchase).count(),
            0,
        )

    def test_deactivating_import_cost_discards_cost_calculation(self):
        import_cost = self.create_import_cost()

        self.calculate_costs()

        # Desactivar saca el costo del total (purchase_cost_summary solo
        # suma los activos), así que el cálculo también queda obsoleto.
        response = self.client.patch(
            f"/api/inventory/import-costs/{import_cost.id}/",
            {
                "is_active": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            ProductCostHistory.objects.filter(purchase=self.purchase).count(),
            0,
        )

    def test_delete_import_cost_discards_cost_calculation(self):
        import_cost = self.create_import_cost()

        self.calculate_costs()

        response = self.client.delete(
            f"/api/inventory/import-costs/{import_cost.id}/",
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(
            ProductCostHistory.objects.filter(purchase=self.purchase).count(),
            0,
        )

    def test_import_cost_change_keeps_calculation_of_confirmed_purchase(self):
        import_cost = self.create_import_cost()

        self.calculate_costs()

        confirm_response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/confirm/",
            {},
            format="json",
        )
        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)

        response = self.client.patch(
            f"/api/inventory/import-costs/{import_cost.id}/",
            {
                "amount": "80.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # En una compra confirmada el histórico es el registro de lo que se
        # aplicó: no se borra.
        self.assertEqual(
            ProductCostHistory.objects.filter(purchase=self.purchase).count(),
            1,
        )

    def test_list_product_cost_history(self):
        history = ProductCostHistory.objects.create(
            product=self.purchase.items.first().supplier_product.product,
            purchase=self.purchase,
            original_unit_cost="100.0000",
            cost_factor="1.200000",
            final_unit_cost="120.0000",
            currency=Currency.USD,
            exchange_rate="500.0000",
            margin_percentage="30.0000",
            suggested_price="156.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/product-cost-history/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

        item = response.data["results"][0]

        self.assertEqual(item["id"], history.id)
        self.assertEqual(item["purchase"], self.purchase.id)
        self.assertEqual(
            item["purchase_detail"]["invoice_number"],
            "FAC-001",
        )

    def test_filter_product_cost_history_by_purchase(self):
        product = self.purchase.items.first().supplier_product.product

        ProductCostHistory.objects.create(
            product=product,
            purchase=self.purchase,
            original_unit_cost="100.0000",
            cost_factor="1.200000",
            final_unit_cost="120.0000",
            currency=Currency.USD,
            exchange_rate="500.0000",
            margin_percentage="30.0000",
            suggested_price="156.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        other_purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-003",
            purchase_date=date.today(),
            currency=Currency.USD,
            exchange_rate="500.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        ProductCostHistory.objects.create(
            product=product,
            purchase=other_purchase,
            original_unit_cost="90.0000",
            cost_factor="1.100000",
            final_unit_cost="99.0000",
            currency=Currency.USD,
            exchange_rate="500.0000",
            margin_percentage="20.0000",
            suggested_price="118.8000",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/product-cost-history/",
            {
                "purchase": self.purchase.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["purchase"], self.purchase.id)

    def test_filter_product_cost_history_by_purchase_status(self):
        product = self.purchase.items.first().supplier_product.product

        # Cálculo de la compra en borrador de setUp.
        ProductCostHistory.objects.create(
            product=product,
            purchase=self.purchase,
            original_unit_cost="100.0000",
            cost_factor="1.200000",
            final_unit_cost="120.0000",
            currency=Currency.USD,
            exchange_rate="500.0000",
            margin_percentage="30.0000",
            suggested_price="156.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        confirmed_purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="FAC-004",
            purchase_date=date.today(),
            currency=Currency.USD,
            exchange_rate="500.0000",
            status=PurchaseStatus.CONFIRMED,
            created_by=self.user,
            updated_by=self.user,
        )

        ProductCostHistory.objects.create(
            product=product,
            purchase=confirmed_purchase,
            original_unit_cost="90.0000",
            cost_factor="1.100000",
            final_unit_cost="99.0000",
            currency=Currency.USD,
            exchange_rate="500.0000",
            margin_percentage="20.0000",
            suggested_price="118.8000",
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.get(
            "/api/inventory/product-cost-history/",
            {
                "product": product.id,
                "purchase_status": PurchaseStatus.CONFIRMED,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["purchase"],
            confirmed_purchase.id,
        )

        # Sin el filtro se ve todo el histórico: es lo que necesita la
        # pantalla de una compra en borrador para ver su propio cálculo.
        response = self.client.get(
            "/api/inventory/product-cost-history/",
            {
                "product": product.id,
            },
        )

        self.assertEqual(response.data["count"], 2)

    def test_product_cost_history_rejects_invalid_purchase_status(self):
        response = self.client.get(
            "/api/inventory/product-cost-history/",
            {
                "purchase_status": "CUALQUIERA",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_product_cost_history_is_read_only(self):
        product = self.purchase.items.first().supplier_product.product

        history = ProductCostHistory.objects.create(
            product=product,
            purchase=self.purchase,
            original_unit_cost="100.0000",
            cost_factor="1.200000",
            final_unit_cost="120.0000",
            currency=Currency.USD,
            exchange_rate="500.0000",
            margin_percentage="30.0000",
            suggested_price="156.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        patch_response = self.client.patch(
            f"/api/inventory/product-cost-history/{history.id}/",
            {
                "suggested_price": "999.0000",
            },
            format="json",
        )

        post_response = self.client.post(
            "/api/inventory/product-cost-history/",
            {
                "product": product.id,
                "purchase": self.purchase.id,
                "original_unit_cost": "100.0000",
                "cost_factor": "1.200000",
                "final_unit_cost": "120.0000",
                "currency": Currency.USD,
                "exchange_rate": "500.0000",
                "margin_percentage": "30.0000",
                "suggested_price": "156.0000",
            },
            format="json",
        )

        self.assertEqual(
            patch_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            post_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

        history.refresh_from_db()

        self.assertEqual(str(history.suggested_price), "156.0000")