from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.money import DiscountType, compute_document_amounts
from apps.core.permissions import (
    ROLE_ADMIN,
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
from apps.documents import pdf as documents_pdf
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
                "items": [{"product_id": self.product.id}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_proforma_requires_items(self):
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
                "items": [
                    {"product_id": self.product.id},
                    {"product_id": self.other_product.id},
                ],
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
                "items": [{"product_id": self.product.id}],
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
                "items": [{"product_id": 999999}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_proforma_returns_400_for_nonexistent_customer(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            "/api/documents/proforma/",
            {
                "items": [{"product_id": self.product.id}],
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
                "items": [{"product_id": self.product.id}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sales_user_can_create_proforma(self):
        # Ventas cotiza desde /sales/proforma (add_documents en su rol).
        sales_user = User.objects.create_user(
            username="proforma-sales",
            password="12345678",
        )
        sales_user.groups.add(Group.objects.get(name=ROLE_SALES))
        self.client.force_authenticate(sales_user)

        response = self.client.post(
            "/api/documents/proforma/",
            {
                "items": [{"product_id": self.product.id, "quantity": 2}],
                "customer_id": self.customer.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            b"".join(response.streaming_content).startswith(b"%PDF")
        )

    def post_and_capture_summary(self, payload):
        """Montos que la proforma le pasa al PDF (punto 15)."""

        self.client.force_authenticate(self.user)

        with mock.patch.object(
            documents_pdf,
            "_build_itemized_document_pdf",
            wraps=documents_pdf._build_itemized_document_pdf,
        ) as build:
            response = self.client.post(
                "/api/documents/proforma/",
                payload,
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        return build.call_args.kwargs["summary"]

    def test_proforma_defaults_to_13_percent_tax(self):
        # 2 × 15 000 = 30 000 + 13 % = 33 900; el producto sin precio
        # no suma.
        summary = self.post_and_capture_summary(
            {
                "items": [
                    {"product_id": self.product.id, "quantity": 2},
                    {"product_id": self.other_product.id},
                ],
            },
        )

        self.assertEqual(summary.amounts.subtotal, Decimal("30000.00"))
        self.assertEqual(summary.amounts.tax_amount, Decimal("3900.00"))
        self.assertEqual(summary.amounts.total, Decimal("33900.00"))

    def test_proforma_applies_amount_and_percent_discounts(self):
        cases = {
            # 30 000 − 5 000 = 25 000, sin impuesto.
            "AMOUNT": ("5000", Decimal("25000.00")),
            # 30 000 − 10 % = 27 000, sin impuesto.
            "PERCENT": ("10", Decimal("27000.00")),
        }

        for discount_type, (value, expected_total) in cases.items():
            with self.subTest(discount_type=discount_type):
                summary = self.post_and_capture_summary(
                    {
                        "items": [
                            {"product_id": self.product.id, "quantity": 2},
                        ],
                        "discount_type": discount_type,
                        "discount_value": value,
                        "tax_percentage": "0",
                    },
                )

                self.assertEqual(summary.amounts.total, expected_total)

    def test_proforma_without_discount_or_tax_has_no_summary_lines(self):
        summary = self.post_and_capture_summary(
            {
                "items": [{"product_id": self.product.id}],
                "tax_percentage": "0",
            },
        )

        self.assertEqual(summary.lines(), [])
        self.assertEqual(summary.amounts.total, Decimal("15000.00"))

    def test_proforma_rejects_invalid_discount_or_tax(self):
        self.client.force_authenticate(self.user)

        cases = {
            "descuento mayor al subtotal": (
                {"discount_value": "15000.01"},
                "discount_value",
            ),
            "porcentaje mayor a 100": (
                {"discount_type": "PERCENT", "discount_value": "101"},
                "discount_value",
            ),
            "impuesto mayor a 100": (
                {"tax_percentage": "101"},
                "tax_percentage",
            ),
            "tipo inválido": ({"discount_type": "OTRO"}, "discount_type"),
        }

        for case, (extra, field_name) in cases.items():
            with self.subTest(case=case):
                response = self.client.post(
                    "/api/documents/proforma/",
                    {"items": [{"product_id": self.product.id}], **extra},
                    format="json",
                )

                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
                self.assertIn(field_name, response.data)

    def post_items_and_capture_rows(self, items):
        """
        Devuelve las filas (código, nombre, importe) que la proforma le
        pasa al generador del PDF, para revisar cantidades sin leer el
        PDF binario.
        """

        self.client.force_authenticate(self.user)

        with mock.patch.object(
            documents_pdf,
            "_build_itemized_document_pdf",
            wraps=documents_pdf._build_itemized_document_pdf,
        ) as build:
            response = self.client.post(
                "/api/documents/proforma/",
                {"items": items},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        return build.call_args.kwargs["rows"]

    def test_proforma_line_shows_quantity_and_line_amount(self):
        rows = self.post_items_and_capture_rows(
            [{"product_id": self.product.id, "quantity": 3}],
        )

        self.assertEqual(
            rows,
            [("PROF-001", "Producto proforma × 3", Decimal("45000.0000"))],
        )

    def test_proforma_line_shows_own_code_before_quantity(self):
        # Punto 16: el código propio va junto al nombre de la línea.
        self.product.own_code = "KG-77"
        self.product.save(update_fields=["own_code"])

        rows = self.post_items_and_capture_rows(
            [{"product_id": self.product.id, "quantity": 3}],
        )

        self.assertEqual(rows[0][0], "PROF-001")
        self.assertEqual(rows[0][1], "Producto proforma (cód. KG-77) × 3")

    def test_long_line_name_keeps_own_code_and_quantity(self):
        line = documents_pdf._document_line_name(
            SimpleNamespace(name="X" * 200, own_code="KG-77"),
            quantity=12,
        )

        self.assertTrue(line.endswith("... (cód. KG-77) × 12"))

    def test_proforma_quantity_defaults_to_one(self):
        rows = self.post_items_and_capture_rows(
            [{"product_id": self.product.id}],
        )

        self.assertEqual(
            rows,
            [("PROF-001", "Producto proforma", Decimal("15000.0000"))],
        )

    def test_proforma_merges_repeated_products_keeping_order(self):
        rows = self.post_items_and_capture_rows(
            [
                {"product_id": self.product.id, "quantity": 1},
                {"product_id": self.other_product.id, "quantity": 1},
                {"product_id": self.product.id, "quantity": 2},
            ],
        )

        self.assertEqual(
            [(code, name) for code, name, _amount in rows],
            [
                ("PROF-001", "Producto proforma × 3"),
                ("PROF-002", "Producto sin precio"),
            ],
        )
        # Sin precio sigue sin precio, aunque tenga cantidad.
        self.assertIsNone(rows[1][2])

    def test_proforma_rejects_invalid_quantities(self):
        self.client.force_authenticate(self.user)

        for quantity in (0, -1, 1.5, "2", True, 10_000):
            with self.subTest(quantity=quantity):
                response = self.client.post(
                    "/api/documents/proforma/",
                    {
                        "items": [
                            {"product_id": self.product.id, "quantity": quantity},
                        ],
                    },
                    format="json",
                )

                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
                self.assertIn("items", response.data)

    def test_authenticated_user_without_group_cannot_create_proforma(self):
        self.client.force_authenticate(self.plain_user)

        response = self.client.post(
            "/api/documents/proforma/",
            {
                "items": [{"product_id": self.product.id}],
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

        # La factura de servicio trae el precio, que solo maneja el
        # Administrador (punto 25).
        self.admin_user = User.objects.create_user(
            username="invoice-admin",
            password="12345678",
        )
        self.admin_user.groups.add(
            Group.objects.get(name=ROLE_ADMIN),
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

    def create_confirmed_sale(self, **amount_settings):
        sale = Sale.objects.create(
            customer=self.customer,
            sale_date=date.today(),
            currency="CRC",
            created_by=self.sales_user,
            updated_by=self.sales_user,
            **amount_settings,
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

    def test_sale_invoice_with_discount_and_tax_returns_pdf(self):
        sale = self.create_confirmed_sale(
            discount_type="PERCENT",
            discount_value=Decimal("10"),
            tax_percentage=Decimal("13"),
        )

        self.client.force_authenticate(self.sales_user)

        response = self.client.get(f"/api/documents/sales/{sale.id}/invoice/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF"))

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

        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            f"/api/documents/services/{service_record.id}/invoice/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")

        content = b"".join(response.streaming_content)
        self.assertTrue(content.startswith(b"%PDF"))

    def test_service_invoice_with_discount_and_tax_returns_pdf(self):
        service_record = self.create_delivered_service()
        InjectorServiceRecord.objects.filter(pk=service_record.pk).update(
            discount_value=Decimal("1000"),
            tax_percentage=Decimal("13"),
            subtotal_amount=Decimal("20000"),
            discount_amount=Decimal("1000"),
            tax_amount=Decimal("2470"),
            total_amount=Decimal("21470"),
        )

        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            f"/api/documents/services/{service_record.id}/invoice/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF"))

    def test_service_invoice_rejects_non_delivered_service(self):
        service_record = InjectorServiceRecord.objects.create(
            injector=self.injector,
            received_at=timezone.now(),
            status=InjectorServiceStatus.IN_PROGRESS,
            price=Decimal("20000.0000"),
            created_by=self.sales_user,
            updated_by=self.sales_user,
        )

        self.client.force_authenticate(self.admin_user)

        response = self.client.get(
            f"/api/documents/services/{service_record.id}/invoice/"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_service_invoice_404_for_missing_service(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get("/api/documents/services/999999/invoice/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customers_user_cannot_get_service_invoice(self):
        # El operario no ve el precio del servicio (punto 25), y la
        # factura lo trae.
        service_record = self.create_delivered_service()

        self.client.force_authenticate(self.customers_user)

        response = self.client.get(
            f"/api/documents/services/{service_record.id}/invoice/"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_plain_user_cannot_get_service_invoice(self):
        service_record = self.create_delivered_service()

        self.client.force_authenticate(self.plain_user)

        response = self.client.get(
            f"/api/documents/services/{service_record.id}/invoice/"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class DocumentAmountsSummaryTest(APITestCase):
    """
    Las líneas Subtotal / Descuento / Impuesto que pintan la factura de
    venta y la de servicio (puntos 19 y 26). Se prueban aparte porque
    leer el texto del PDF es frágil.
    """

    def test_lists_subtotal_discount_and_tax(self):
        summary = documents_pdf.DocumentAmountsSummary(
            amounts=compute_document_amounts(
                Decimal("20000"),
                DiscountType.PERCENT,
                Decimal("10"),
                Decimal("13"),
            ),
            tax_percentage=Decimal("13.00"),
            discount_percentage=Decimal("10.0000"),
        )

        self.assertEqual(
            summary.lines(),
            [
                ("Subtotal", "CRC 20 000"),
                ("Descuento (10 %)", "- CRC 2 000"),
                ("Impuesto (13 %)", "CRC 2 340"),
            ],
        )

    def test_omits_zero_lines(self):
        only_tax = documents_pdf.DocumentAmountsSummary(
            amounts=compute_document_amounts(
                Decimal("1000"),
                DiscountType.AMOUNT,
                Decimal("0"),
                Decimal("13"),
            ),
            tax_percentage=Decimal("13"),
        )
        nothing = documents_pdf.DocumentAmountsSummary(
            amounts=compute_document_amounts(Decimal("1000")),
            tax_percentage=Decimal("0"),
        )

        self.assertEqual(
            [label for label, _amount in only_tax.lines()],
            ["Subtotal", "Impuesto (13 %)"],
        )
        self.assertEqual(nothing.lines(), [])
