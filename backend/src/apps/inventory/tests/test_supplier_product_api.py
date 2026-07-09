from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.inventory.models import (
    Product,
    StorageLocation,
    Supplier,
    SupplierProduct,
)

User = get_user_model()


class SupplierProductApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            password="12345678",
        )

        self.client.force_authenticate(self.user)

        self.location = StorageLocation.objects.create(
            code="A124",
            description="Ubicación A124",
            created_by=self.user,
            updated_by=self.user,
        )

        self.supplier = Supplier.objects.create(
            name="Bosch",
            created_by=self.user,
            updated_by=self.user,
        )

        self.product = Product.objects.create(
            standard_code="1-423-124-108",
            name="Tornillo bloqueo Cummins",
            description="Tornillo bloqueo para inyector Cummins",
            storage_location=self.location,
            minimum_stock=1,
            created_by=self.user,
            updated_by=self.user,
        )

        self.supplier_product = SupplierProduct.objects.create(
            supplier=self.supplier,
            product=self.product,
            supplier_reference="BOSCH-001",
            manufacturer="Bosch",
            preferred_supplier=True,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_list_supplier_products(self):
        response = self.client.get("/api/inventory/supplier-products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

        self.assertEqual(item["supplier"], self.supplier.id)
        self.assertEqual(item["supplier_detail"]["name"], "BOSCH")
        self.assertEqual(item["product"], self.product.id)
        self.assertEqual(
            item["product_detail"]["standard_code"],
            "1-423-124-108",
        )
        self.assertEqual(
            item["product_detail"]["name"],
            "Tornillo bloqueo Cummins",
        )
        self.assertEqual(item["supplier_reference"], "BOSCH-001")
        self.assertEqual(item["manufacturer"], "Bosch")
        self.assertTrue(item["preferred_supplier"])

    def test_create_supplier_product(self):
        supplier = Supplier.objects.create(
            name="Denso",
            created_by=self.user,
            updated_by=self.user,
        )

        location = StorageLocation.objects.create(
            code="B555",
            description="Ubicación B555",
            created_by=self.user,
            updated_by=self.user,
        )

        product = Product.objects.create(
            standard_code="D-555",
            name="Válvula inyector Denso",
            description="Válvula para inyector Denso",
            storage_location=location,
            minimum_stock=2,
            created_by=self.user,
            updated_by=self.user,
        )

        response = self.client.post(
            "/api/inventory/supplier-products/",
            {
                "supplier": supplier.id,
                "product": product.id,
                "supplier_reference": "DEN-555",
                "manufacturer": "Denso",
                "preferred_supplier": False,
                "notes": "Referencia inicial del proveedor",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        supplier_product = SupplierProduct.objects.get(id=response.data["id"])

        self.assertEqual(supplier_product.supplier, supplier)
        self.assertEqual(supplier_product.product, product)
        self.assertEqual(supplier_product.supplier_reference, "DEN-555")
        self.assertEqual(supplier_product.manufacturer, "Denso")
        self.assertFalse(supplier_product.preferred_supplier)
        self.assertEqual(
            supplier_product.notes,
            "Referencia inicial del proveedor",
        )
        self.assertEqual(supplier_product.created_by, self.user)
        self.assertEqual(supplier_product.updated_by, self.user)

    def test_update_supplier_product(self):
        response = self.client.patch(
            f"/api/inventory/supplier-products/{self.supplier_product.id}/",
            {
                "supplier_reference": "BOSCH-002",
                "manufacturer": "Bosch Alemania",
                "preferred_supplier": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.supplier_product.refresh_from_db()

        self.assertEqual(
            self.supplier_product.supplier_reference,
            "BOSCH-002",
        )
        self.assertEqual(
            self.supplier_product.manufacturer,
            "Bosch Alemania",
        )
        self.assertFalse(self.supplier_product.preferred_supplier)
        self.assertEqual(self.supplier_product.updated_by, self.user)