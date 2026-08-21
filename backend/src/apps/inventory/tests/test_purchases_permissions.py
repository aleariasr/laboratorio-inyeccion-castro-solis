from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
)
from apps.inventory.models import (
    Product,
    Purchase,
    StorageLocation,
    Supplier,
    SupplierProduct,
)

User = get_user_model()


def _module_permission(codename):
    return Permission.objects.get(
        content_type__app_label="core",
        content_type__model="modulepermissions",
        codename=codename,
    )


class PurchasesPermissionApiTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.inventory_user = User.objects.create_user(
            username="purchases-inventory",
            password="12345678",
        )
        self.inventory_user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        self.read_only_user = User.objects.create_user(
            username="purchases-readonly",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="purchases-plain",
            password="12345678",
        )

        self.supplier = Supplier.objects.create(
            name="Proveedor compras",
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        self.location = StorageLocation.objects.create(
            code="A101",
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        self.product = Product.objects.create(
            standard_code="PUR-001",
            name="Producto de compra",
            storage_location=self.location,
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        self.supplier_product = SupplierProduct.objects.create(
            supplier=self.supplier,
            product=self.product,
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

        # Compra en borrador: alcanza para probar create/change/cancel
        # sin tener que pasar por confirm() y su lógica de reversión
        # de stock, que no es lo que este archivo prueba.
        self.purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number="PUR-FAC-001",
            purchase_date=date.today(),
            currency="CRC",
            created_by=self.inventory_user,
            updated_by=self.inventory_user,
        )

    def _user_with_permission(self, codename, username):
        user = User.objects.create_user(
            username=username,
            password="12345678",
        )
        user.user_permissions.add(_module_permission(codename))
        return user

    def test_inventory_user_can_create_purchase(self):
        self.client.force_authenticate(self.inventory_user)

        response = self.client.post(
            "/api/inventory/purchases/",
            {
                "supplier": self.supplier.id,
                "invoice_number": "PUR-FAC-002",
                "purchase_date": str(date.today()),
                "currency": "CRC",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_read_only_user_can_list_purchases(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get("/api/inventory/purchases/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_create_purchase(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/inventory/purchases/",
            {
                "supplier": self.supplier.id,
                "invoice_number": "PUR-FAC-003",
                "purchase_date": str(date.today()),
                "currency": "CRC",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_list_purchases(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get("/api/inventory/purchases/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_purchases(self):
        response = self.client.get("/api/inventory/purchases/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inventory_user_can_cancel_draft_purchase(self):
        self.client.force_authenticate(self.inventory_user)

        response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/cancel/",
            {"reason": "Prueba de anulación"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_user_with_only_change_purchases_permission_cannot_cancel(self):
        """
        change_purchases y cancel_purchases son permisos separados a
        propósito: quien solo puede editar compras no debería poder
        anularlas. Esto prueba el flujo HTTP completo, no solo la
        mecánica de ModulePermission en aislamiento.
        """
        user = self._user_with_permission(
            "change_purchases",
            "purchases-change-only",
        )
        self.client.force_authenticate(user)

        response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/cancel/",
            {"reason": "Prueba de anulación"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_with_only_cancel_purchases_permission_can_cancel_but_not_update(self):
        user = self._user_with_permission(
            "cancel_purchases",
            "purchases-cancel-only",
        )
        self.client.force_authenticate(user)

        update_response = self.client.patch(
            f"/api/inventory/purchases/{self.purchase.id}/",
            {"notes": "Intento de edición"},
            format="json",
        )

        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)

        cancel_response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/cancel/",
            {"reason": "Prueba de anulación"},
            format="json",
        )

        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)

    def test_read_only_user_cannot_cancel_purchase(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            f"/api/inventory/purchases/{self.purchase.id}/cancel/",
            {"reason": "Prueba de anulación"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
