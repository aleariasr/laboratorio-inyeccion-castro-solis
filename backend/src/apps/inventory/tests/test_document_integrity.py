from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import ROLE_ADMIN
from apps.inventory.models import (
    InventoryCount,
    InventoryCountItem,
    InventoryCountStatus,
    Product,
    Purchase,
    PurchaseItem,
    StorageLocation,
    Supplier,
    SupplierProduct,
)
from apps.inventory.services import approve_inventory_count, confirm_purchase

User = get_user_model()


class DocumentLinesIntegrityTest(APITestCase):
    """
    Pasada previa a la 2.5.0 (2026-10-27): una línea no cambia de
    documento. Antes una línea de compra en borrador podía pasar a una
    compra confirmada (sin entrada de inventario) y una línea de un conteo
    aprobado podía salir de él.
    """

    def setUp(self):
        call_command("setup_roles")

        self.user = User.objects.create_user(username="documentos-integridad", password="12345678")
        self.user.groups.add(Group.objects.get(name=ROLE_ADMIN))

        location = StorageLocation.objects.create(
            code="D1",
            created_by=self.user,
            updated_by=self.user,
        )
        self.product = Product.objects.create(
            standard_code="D-INT",
            name="Producto documentos",
            storage_location=location,
            created_by=self.user,
            updated_by=self.user,
        )
        supplier = Supplier.objects.create(
            name="Proveedor integridad",
            created_by=self.user,
            updated_by=self.user,
        )
        self.supplier_product = SupplierProduct.objects.create(
            supplier=supplier,
            product=self.product,
            manufacturer="Bosch",
            created_by=self.user,
            updated_by=self.user,
        )
        self.supplier = supplier

        self.client.force_authenticate(self.user)

    def purchase_with_line(self, invoice_number):
        purchase = Purchase.objects.create(
            supplier=self.supplier,
            invoice_number=invoice_number,
            purchase_date=date.today(),
            currency="CRC",
            exchange_rate=Decimal("1.0000"),
            created_by=self.user,
            updated_by=self.user,
        )
        item = PurchaseItem.objects.create(
            purchase=purchase,
            supplier_product=self.supplier_product,
            quantity=5,
            unit_cost=Decimal("100.0000"),
            created_by=self.user,
            updated_by=self.user,
        )

        return purchase, item

    def count_with_line(self, reference):
        inventory_count = InventoryCount.objects.create(
            reference=reference,
            count_date=date.today(),
            created_by=self.user,
            updated_by=self.user,
        )
        item = InventoryCountItem.objects.create(
            inventory_count=inventory_count,
            product=self.product,
            counted_quantity=3,
            created_by=self.user,
            updated_by=self.user,
        )

        return inventory_count, item

    def test_a_purchase_line_cannot_move_to_another_purchase(self):
        confirmed, _ = self.purchase_with_line("FAC-CONF")
        confirm_purchase(purchase=confirmed, user=self.user)
        _draft, line = self.purchase_with_line("FAC-BORR")

        response = self.client.patch(
            f"/api/inventory/purchase-items/{line.id}/",
            {"purchase": confirmed.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("purchase", response.data)
        self.assertEqual(confirmed.items.count(), 1)

    def test_a_line_cannot_leave_an_approved_count(self):
        approved, line = self.count_with_line("CONTEO-APROBADO")
        approve_inventory_count(inventory_count=approved, user=self.user)
        draft = InventoryCount.objects.create(
            reference="CONTEO-BORRADOR",
            count_date=date.today(),
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/inventory-count-items/{line.id}/",
            {"inventory_count": draft.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("inventory_count", response.data)

        line.refresh_from_db()
        approved.refresh_from_db()

        self.assertEqual(line.inventory_count_id, approved.id)
        self.assertEqual(approved.status, InventoryCountStatus.APPROVED)

    def test_deleting_a_supplier_with_purchases_is_a_notice_not_an_error(self):
        self.purchase_with_line("FAC-PROV")

        response = self.client.delete(f"/api/inventory/suppliers/{self.supplier.id}/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("registros asociados", response.data["detail"])
