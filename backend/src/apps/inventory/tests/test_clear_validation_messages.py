"""
Auditoría integral del 2026-11-07: los duplicados respondían con el
mensaje que DRF genera de la restricción única ("Ya existe Producto con
este own code.", "Los campos supplier, invoice_number deben formar un
conjunto único."), antes que los mensajes claros que ya tenía validate.
También: un conteo vacío ya no se aprueba.
"""

from datetime import date

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
    StorageLocation,
    Supplier,
)

User = get_user_model()


class ClearValidationMessagesTest(APITestCase):
    def setUp(self):
        call_command("setup_roles")

        self.user = User.objects.create_user(
            username="messages-admin",
            password="12345678",
        )
        self.user.groups.add(Group.objects.get(name=ROLE_ADMIN))
        self.client.force_authenticate(self.user)

        self.location = StorageLocation.objects.create(
            code="A101",
            created_by=self.user,
            updated_by=self.user,
        )
        self.product = Product.objects.create(
            standard_code="P-001",
            own_code="PROPIO-1",
            name="Producto prueba",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )
        self.supplier = Supplier.objects.create(
            name="Proveedor uno",
            created_by=self.user,
            updated_by=self.user,
        )
        self.other_supplier = Supplier.objects.create(
            name="Proveedor dos",
            created_by=self.user,
            updated_by=self.user,
        )
        self.count = InventoryCount.objects.create(
            reference="CONTEO-1",
            count_date=date.today(),
            created_by=self.user,
            updated_by=self.user,
        )

    # --- Productos --------------------------------------------------------

    def test_repeated_own_code_on_create(self):
        response = self.client.post(
            "/api/inventory/products/",
            {
                "standard_code": "P-002",
                "own_code": "propio-1",
                "name": "Otro",
                "storage_location": self.location.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["own_code"],
            ["Ya existe un producto con este código propio."],
        )

    def test_repeated_own_code_on_add_variant(self):
        response = self.client.post(
            f"/api/inventory/products/{self.product.id}/add-variant/",
            {"name": "Genérico", "variant_kind": "GENERIC", "own_code": "PROPIO-1"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["own_code"],
            ["Ya existe un producto con este código propio."],
        )

    def test_saving_a_product_with_its_own_code_still_works(self):
        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {"own_code": "PROPIO-1", "name": "Nombre nuevo"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_two_products_without_own_code_are_allowed(self):
        for code in ("P-010", "P-011"):
            response = self.client.post(
                "/api/inventory/products/",
                {
                    "standard_code": code,
                    "own_code": "",
                    "name": "Sin código propio",
                    "storage_location": self.location.id,
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    # --- Compras ----------------------------------------------------------

    def purchase_payload(self, supplier, invoice):
        return {
            "supplier": supplier.id,
            "invoice_number": invoice,
            "purchase_date": date.today().isoformat(),
            "currency": "CRC",
            "exchange_rate": "1",
        }

    def test_repeated_invoice_for_the_same_supplier(self):
        self.client.post(
            "/api/inventory/purchases/",
            self.purchase_payload(self.supplier, "FAC-1"),
            format="json",
        )

        response = self.client.post(
            "/api/inventory/purchases/",
            self.purchase_payload(self.supplier, " fac-1 "),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["invoice_number"],
            ["Este proveedor ya tiene una compra con ese número de factura."],
        )
        self.assertEqual(Purchase.objects.count(), 1)

    def test_same_invoice_for_another_supplier_is_allowed(self):
        self.client.post(
            "/api/inventory/purchases/",
            self.purchase_payload(self.supplier, "FAC-1"),
            format="json",
        )

        response = self.client.post(
            "/api/inventory/purchases/",
            self.purchase_payload(self.other_supplier, "FAC-1"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_editing_a_purchase_keeps_its_own_invoice(self):
        created = self.client.post(
            "/api/inventory/purchases/",
            self.purchase_payload(self.supplier, "FAC-1"),
            format="json",
        )

        response = self.client.patch(
            f"/api/inventory/purchases/{created.data['id']}/",
            {"invoice_number": "FAC-1", "notes": "Nota"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # --- Conteos ----------------------------------------------------------

    def test_repeated_count_reference(self):
        response = self.client.post(
            "/api/inventory/inventory-counts/",
            {"reference": "conteo-1", "count_date": date.today().isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["reference"],
            ["Ya existe un conteo con esta referencia."],
        )

    def test_repeated_product_in_a_count(self):
        InventoryCountItem.objects.create(
            inventory_count=self.count,
            product=self.product,
            counted_quantity=1,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            "/api/inventory/inventory-count-items/",
            {
                "inventory_count": self.count.id,
                "product": self.product.id,
                "counted_quantity": 2,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["non_field_errors"],
            ["Este producto ya está registrado en el conteo."],
        )

    def test_empty_count_cannot_be_approved(self):
        response = self.client.post(
            f"/api/inventory/inventory-counts/{self.count.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "El conteo no tiene productos.")
        self.count.refresh_from_db()
        self.assertEqual(self.count.status, InventoryCountStatus.DRAFT)

    # --- Ubicaciones ------------------------------------------------------

    def test_inactive_location_message_is_neutral(self):
        inactive = StorageLocation.objects.create(
            code="Z999",
            is_active=False,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.patch(
            f"/api/inventory/products/{self.product.id}/",
            {"storage_location": inactive.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["storage_location"],
            ["La ubicación está inactiva; no se le asignan productos."],
        )

    def test_location_with_active_products_cannot_be_deactivated(self):
        response = self.client.patch(
            f"/api/inventory/locations/{self.location.id}/",
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("productos activos", response.data["is_active"][0])
