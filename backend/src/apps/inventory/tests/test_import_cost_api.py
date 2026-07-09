from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.inventory.models import (
    Currency,
    ImportCost,
    ImportCostCategory,
    Purchase,
    Supplier,
)

User = get_user_model()


class ImportCostApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        self.client.force_authenticate(self.user)

        self.supplier = Supplier.objects.create(
            name="Proveedor prueba",
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
        self.assertEqual(len(response.data), 1)

        self.assertEqual(response.data[0]["name"], "FLETES")

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
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

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
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["purchase"], self.purchase.id)

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