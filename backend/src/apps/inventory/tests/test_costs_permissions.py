from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)
from apps.inventory.models import (
    Product,
    ProductCostHistory,
    Purchase,
    PurchaseStatus,
    StorageLocation,
    Supplier,
)

User = get_user_model()


class CostsVisibilityApiTest(APITestCase):
    """
    El costo de compra y lo que se deriva de él (histórico de costos y
    precio sugerido) son solo para quien tiene view_costs, hoy únicamente
    el Administrador. El precio de venta efectivo, en cambio, lo necesita
    cualquiera que arme una venta o una proforma (puntos 4, 13 y 14).
    """

    def setUp(self):
        call_command("setup_roles")

        self.admin = self.create_user("costs-admin", ROLE_ADMIN)
        self.inventory_user = self.create_user("costs-inventory", ROLE_INVENTORY)
        self.sales_user = self.create_user("costs-sales", ROLE_SALES)
        self.customers_user = self.create_user("costs-customers", ROLE_CUSTOMERS)
        self.read_only_user = self.create_user("costs-readonly", ROLE_READ_ONLY)

        self.location = StorageLocation.objects.create(
            code="A101",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.product = Product.objects.create(
            standard_code="P-001",
            name="Producto con costo",
            storage_location=self.location,
            created_by=self.admin,
            updated_by=self.admin,
        )

        supplier = Supplier.objects.create(
            name="Proveedor",
            created_by=self.admin,
            updated_by=self.admin,
        )

        purchase = Purchase.objects.create(
            supplier=supplier,
            invoice_number="FAC-001",
            purchase_date=date.today(),
            currency="CRC",
            exchange_rate="1.0000",
            status=PurchaseStatus.CONFIRMED,
            created_by=self.admin,
            updated_by=self.admin,
        )

        ProductCostHistory.objects.create(
            product=self.product,
            purchase=purchase,
            original_unit_cost="100.0000",
            cost_factor="1.200000",
            final_unit_cost="120.0000",
            currency="CRC",
            exchange_rate="1.0000",
            margin_percentage="30.0000",
            suggested_price="156.0000",
            created_by=self.admin,
            updated_by=self.admin,
        )

    def create_user(self, username, role):
        user = User.objects.create_user(username=username, password="12345678")
        user.groups.add(Group.objects.get(name=role))

        return user

    def get_product(self, user):
        self.client.force_authenticate(user)

        response = self.client.get(f"/api/inventory/products/{self.product.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        return response.data

    # --- Histórico de costos -------------------------------------------

    def test_admin_can_read_cost_history(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get("/api/inventory/product-cost-history/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_roles_without_view_costs_cannot_read_cost_history(self):
        for user in (
            self.inventory_user,
            self.sales_user,
            self.customers_user,
            self.read_only_user,
        ):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)

                response = self.client.get("/api/inventory/product-cost-history/")

                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_individual_view_costs_permission_is_enough(self):
        """
        El permiso se puede dar suelto a un usuario, sin cambiarle el rol
        (es la casilla "Costos: ver" de la pantalla de usuarios).
        """

        user = User.objects.create_user(
            username="costs-individual",
            password="12345678",
        )
        user.groups.add(Group.objects.get(name=ROLE_SALES))
        user.user_permissions.add(
            Permission.objects.get(
                content_type__app_label="core",
                content_type__model="modulepermissions",
                codename="view_costs",
            ),
        )

        self.client.force_authenticate(user)

        self.assertEqual(
            self.client.get("/api/inventory/product-cost-history/").status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.get_product(user)["latest_suggested_price"],
            "156.0000",
        )

    # --- Precio sugerido vs. precio de venta ---------------------------

    def test_admin_sees_the_suggested_price(self):
        data = self.get_product(self.admin)

        self.assertEqual(data["latest_suggested_price"], "156.0000")
        self.assertEqual(data["effective_sale_price"], "156.0000")

    def test_roles_without_view_costs_do_not_see_the_suggested_price(self):
        for user in (
            self.inventory_user,
            self.sales_user,
            self.customers_user,
            self.read_only_user,
        ):
            with self.subTest(user=user.username):
                data = self.get_product(user)

                self.assertIsNone(data["latest_suggested_price"])

                # El precio al que se vende sí se ve: es lo que necesita
                # quien arma una venta o una proforma.
                self.assertEqual(data["effective_sale_price"], "156.0000")

    def test_suggested_price_is_hidden_in_the_product_list_too(self):
        self.client.force_authenticate(self.sales_user)

        response = self.client.get("/api/inventory/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        item = response.data["results"][0]

        self.assertIsNone(item["latest_suggested_price"])
        self.assertEqual(item["effective_sale_price"], "156.0000")

    # --- Búsqueda de productos para venta y servicio (punto 4) ---------

    def test_sales_and_customers_can_search_products(self):
        for user in (self.sales_user, self.customers_user):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)

                response = self.client.get(
                    "/api/inventory/products/",
                    {"q": "Producto"},
                )

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["count"], 1)

    def test_sales_and_customers_still_cannot_modify_products(self):
        for user in (self.sales_user, self.customers_user):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)

                response = self.client.patch(
                    f"/api/inventory/products/{self.product.id}/",
                    {"name": "Otro nombre"},
                    format="json",
                )

                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                )
