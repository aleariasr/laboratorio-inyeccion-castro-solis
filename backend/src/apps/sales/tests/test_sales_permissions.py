from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_READ_ONLY,
    ROLE_SALES,
)
from apps.customers.models import Customer
from apps.inventory.models import Product, StorageLocation
from apps.inventory.services import initial_inventory
from apps.sales.models import Sale, SaleItem
from apps.sales.services import confirm_sale

User = get_user_model()


def _module_permission(codename):
    return Permission.objects.get(
        content_type__app_label="core",
        content_type__model="modulepermissions",
        codename=codename,
    )


class SalesPermissionApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.sales_user = User.objects.create_user(
            username="sales",
            password="12345678",
        )
        self.sales_user.groups.add(
            Group.objects.get(name=ROLE_SALES),
        )

        self.read_only_user = User.objects.create_user(
            username="readonly-sales",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="plain-sales",
            password="12345678",
        )

        self.customer = Customer.objects.create(
            customer_type="PERSON",
            display_name="Cliente prueba",
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        self.sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date.today(),
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        # Venta confirmada aparte, con inventario propio: solo la usan
        # los tests de cancel_sales, para no afectar el estado DRAFT
        # que esperan los tests de arriba sobre self.sale.
        self.location = StorageLocation.objects.create(
            code="A101",
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        self.product = Product.objects.create(
            standard_code="SALE-PERM-001",
            name="Producto de venta",
            storage_location=self.location,
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        initial_inventory(
            product=self.product,
            quantity=10,
            user=self.sales_user,
        )

        self.confirmed_sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date.today(),
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        SaleItem.objects.create(
            sale=self.confirmed_sale,
            product=self.product,
            quantity=2,
            unit_price=Decimal("100.0000"),
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        confirm_sale(
            sale=self.confirmed_sale,
            user=self.sales_user,
        )

    def _user_with_permission(self, codename, username):
        user = User.objects.create_user(
            username=username,
            password="12345678",
        )
        user.user_permissions.add(_module_permission(codename))
        return user

    def test_sales_user_can_create_sale(self):
        self.client.force_authenticate(self.sales_user)

        response = self.client.post(
            "/api/sales/sales/",
            {
                "customer": self.customer.id,
                "sale_date": str(date.today()),
                "currency": "CRC",
                "notes": "Venta de prueba",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_read_only_user_can_list_sales(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/sales/sales/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_sale(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/sales/sales/",
            {
                "customer": self.customer.id,
                "sale_date": str(date.today()),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_sales(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/sales/sales/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_sales(self):
        response = self.client.get("/api/sales/sales/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_sales_user_can_cancel_confirmed_sale(self):
        self.client.force_authenticate(self.sales_user)

        response = self.client.post(
            f"/api/sales/sales/{self.confirmed_sale.id}/cancel/",
            {"reason": "Prueba de anulación"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_user_with_only_change_sales_permission_cannot_cancel(self):
        """
        change_sales y cancel_sales son permisos separados a
        propósito: quien solo puede editar ventas no debería poder
        anularlas.
        """
        user = self._user_with_permission(
            "change_sales",
            "sales-change-only",
        )
        self.client.force_authenticate(user)

        response = self.client.post(
            f"/api/sales/sales/{self.confirmed_sale.id}/cancel/",
            {"reason": "Prueba de anulación"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_with_only_cancel_sales_permission_can_cancel_but_not_update(self):
        user = self._user_with_permission(
            "cancel_sales",
            "sales-cancel-only",
        )
        self.client.force_authenticate(user)

        update_response = self.client.patch(
            f"/api/sales/sales/{self.confirmed_sale.id}/",
            {"notes": "Intento de edición"},
            format="json",
        )

        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)

        cancel_response = self.client.post(
            f"/api/sales/sales/{self.confirmed_sale.id}/cancel/",
            {"reason": "Prueba de anulación"},
            format="json",
        )

        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_cancel_sale(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            f"/api/sales/sales/{self.confirmed_sale.id}/cancel/",
            {"reason": "Prueba de anulación"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
