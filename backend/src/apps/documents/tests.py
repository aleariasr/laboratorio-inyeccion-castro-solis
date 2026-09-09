from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.permissions import (
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)
from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceAccessory,
    InjectorServiceRecord,
    InjectorServiceStatus,
)
from apps.inventory.models import Product, StorageLocation
from apps.inventory.services import initial_inventory
from apps.sales.models import Sale, SaleItem
from apps.sales.services import confirm_sale

User = get_user_model()


class ProductLabelsPdfApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="documents-user",
            password="12345678",
        )

        call_command("setup_roles")

        self.user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        self.read_only_user = User.objects.create_user(
            username="documents-readonly",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="documents-plain",
            password="12345678",
        )

        self.location = StorageLocation.objects.create(
            code="D400",
            description="Estante D",
            created_by=self.user,
            updated_by=self.user,
        )

        self.product = Product.objects.create(
            standard_code="DOC-001",
            name="Producto etiqueta",
            description="Descripción para etiqueta",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

    def test_product_labels_requires_authentication(self):
        response = self.client.get(
            "/api/documents/product-labels/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_product_labels_requires_product(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(
            "/api/documents/product-labels/",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_product_labels_returns_pdf(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(
            "/api/documents/product-labels/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(
            "product-labels.pdf",
            response["Content-Disposition"],
        )

        content = b"".join(response.streaming_content)

        self.assertTrue(content.startswith(b"%PDF"))
        self.assertGreater(len(content), 1000)

    def test_product_labels_returns_404_when_product_does_not_exist(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(
            "/api/documents/product-labels/",
            {
                "product": 999999,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_read_only_user_can_generate_product_labels(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.get(
            "/api/documents/product-labels/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_authenticated_user_without_group_cannot_generate_product_labels(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.get(
            "/api/documents/product-labels/",
            {
                "product": self.product.id,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ProformaPdfApiTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="proforma-user",
            password="12345678",
        )

        call_command("setup_roles")

        self.user.groups.add(
            Group.objects.get(name=ROLE_INVENTORY),
        )

        self.read_only_user = User.objects.create_user(
            username="proforma-readonly",
            password="12345678",
        )
        self.read_only_user.groups.add(
            Group.objects.get(name=ROLE_READ_ONLY),
        )

        self.plain_user = User.objects.create_user(
            username="proforma-plain",
            password="12345678",
        )

        self.location = StorageLocation.objects.create(
            code="D401",
            created_by=self.user,
            updated_by=self.user,
        )

        self.product = Product.objects.create(
            standard_code="PROF-001",
            name="Producto proforma",
            storage_location=self.location,
            custom_sale_price="15000.0000",
            created_by=self.user,
            updated_by=self.user,
        )

        self.other_product = Product.objects.create(
            standard_code="PROF-002",
            name="Producto sin precio",
            storage_location=self.location,
            created_by=self.user,
            updated_by=self.user,
        )

        self.customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Juan Pérez",
            identification="1-2345-6789",
            phone="8888-8888",
            created_by=self.user,
            updated_by=self.user,
        )

    def test_proforma_requires_authentication(self):
        response = self.client.post(
            "/api/documents/proforma/",
            {
                "product_ids": [self.product.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_proforma_requires_product_ids(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            "/api/documents/proforma/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_proforma_returns_pdf_without_customer(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            "/api/documents/proforma/",
            {
                "product_ids": [self.product.id, self.other_product.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("proforma.pdf", response["Content-Disposition"])

        content = b"".join(response.streaming_content)

        self.assertTrue(content.startswith(b"%PDF"))
        self.assertGreater(len(content), 500)

    def test_proforma_returns_pdf_with_customer(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            "/api/documents/proforma/",
            {
                "product_ids": [self.product.id],
                "customer_id": self.customer.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        content = b"".join(response.streaming_content)

        self.assertTrue(content.startswith(b"%PDF"))

    def test_proforma_returns_400_for_nonexistent_product(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            "/api/documents/proforma/",
            {
                "product_ids": [999999],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_proforma_returns_400_for_nonexistent_customer(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            "/api/documents/proforma/",
            {
                "product_ids": [self.product.id],
                "customer_id": 999999,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_read_only_user_cannot_create_proforma(self):
        self.client.force_authenticate(self.read_only_user)

        response = self.client.post(
            "/api/documents/proforma/",
            {
                "product_ids": [self.product.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_without_group_cannot_create_proforma(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.post(
            "/api/documents/proforma/",
            {
                "product_ids": [self.product.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class InvoicePdfApiTest(APITestCase):
    def setUp(self):
        self.sales_user = User.objects.create_user(
            username="invoice-sales",
            password="12345678",
        )

        call_command("setup_roles")

        self.sales_user.groups.add(
            Group.objects.get(name=ROLE_SALES),
        )

        self.customers_user = User.objects.create_user(
            username="invoice-customers",
            password="12345678",
        )
        self.customers_user.groups.add(
            Group.objects.get(name=ROLE_CUSTOMERS),
        )

        self.plain_user = User.objects.create_user(
            username="invoice-plain",
            password="12345678",
        )

        self.location = StorageLocation.objects.create(
            code="D402",
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        self.product = Product.objects.create(
            standard_code="INV-001",
            name="Producto factura",
            storage_location=self.location,
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        initial_inventory(
            product=self.product,
            quantity=20,
            user=self.sales_user,
        )

        self.customer = Customer.objects.create(
            customer_type=CustomerType.PERSON,
            display_name="Juan Pérez",
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        self.injector = Injector.objects.create(
            customer=self.customer,
            injector_number="0445110183",
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

    def create_confirmed_sale(self):
        sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date.today(),
            currency="CRC",
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        SaleItem.objects.create(
            sale=sale,
            product=self.product,
            quantity=2,
            unit_price=Decimal("1500.0000"),
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        confirm_sale(sale=sale, user=self.sales_user)

        return sale

    def test_sale_invoice_requires_authentication(self):
        sale = self.create_confirmed_sale()

        response = self.client.get(f"/api/documents/sales/{sale.id}/invoice/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_sale_invoice_returns_pdf_for_confirmed_sale(self):
        sale = self.create_confirmed_sale()

        self.client.force_authenticate(self.sales_user)

        response = self.client.get(f"/api/documents/sales/{sale.id}/invoice/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")

        content = b"".join(response.streaming_content)
        self.assertTrue(content.startswith(b"%PDF"))

    def test_sale_invoice_rejects_draft_sale(self):
        sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date.today(),
            currency="CRC",
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        self.client.force_authenticate(self.sales_user)

        response = self.client.get(f"/api/documents/sales/{sale.id}/invoice/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sale_invoice_404_for_missing_sale(self):
        self.client.force_authenticate(self.sales_user)

        response = self.client.get("/api/documents/sales/999999/invoice/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_plain_user_cannot_get_sale_invoice(self):
        sale = self.create_confirmed_sale()

        self.client.force_authenticate(self.plain_user)

        response = self.client.get(f"/api/documents/sales/{sale.id}/invoice/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def create_delivered_service(self, with_accessory=False):
        service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            delivered_at=timezone.now(),
            status=InjectorServiceStatus.DELIVERED,
            price=Decimal("20000.0000"),
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        if with_accessory:
            InjectorServiceAccessory.objects.create(
                service_record=service_record,
                product=self.product,
                quantity=1,
                created_by=self.sales_user,
                updated_by=self.sales_user,
            )

        return service_record

    def test_service_invoice_returns_pdf_for_delivered_service(self):
        service_record = self.create_delivered_service(with_accessory=True)

        self.client.force_authenticate(self.customers_user)

        response = self.client.get(
            f"/api/documents/services/{service_record.id}/invoice/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")

        content = b"".join(response.streaming_content)
        self.assertTrue(content.startswith(b"%PDF"))

    def test_service_invoice_rejects_non_delivered_service(self):
        service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            status=InjectorServiceStatus.IN_PROGRESS,
            price=Decimal("20000.0000"),
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        self.client.force_authenticate(self.customers_user)

        response = self.client.get(
            f"/api/documents/services/{service_record.id}/invoice/"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_service_invoice_404_for_missing_service(self):
        self.client.force_authenticate(self.customers_user)

        response = self.client.get("/api/documents/services/999999/invoice/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_plain_user_cannot_get_service_invoice(self):
        service_record = self.create_delivered_service()

        self.client.force_authenticate(self.plain_user)

        response = self.client.get(
            f"/api/documents/services/{service_record.id}/invoice/"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)