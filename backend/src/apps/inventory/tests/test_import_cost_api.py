from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_INVENTORY

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


class ImportCostApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        inventory_group, _ = Group.objects.get_or_create(
            name=ROLE_INVENTORY,
        )
        self.user.groups.add(inventory_group)

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
            supplier_reference="SUP-P001",
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