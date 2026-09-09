from django.http import FileResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import DocumentsPermission
from apps.customers.models import (
    Customer,
    InjectorServiceRecord,
    InjectorServiceStatus,
)
from apps.inventory.models import Product
from apps.inventory.selectors import with_latest_suggested_price
from apps.sales.models import Sale, SaleStatus

from .pdf import (
    build_product_labels_pdf,
    build_proforma_pdf,
    build_sale_invoice_pdf,
    build_service_invoice_pdf,
)

MAX_PROFORMA_ITEMS = 200


class ProductLabelsPdfView(APIView):
    permission_classes = [DocumentsPermission]

    def get(self, request):
        product_ids = request.query_params.getlist("product")

        if not product_ids:
            return Response(
                {
                    "detail": "Debe indicar al menos un producto."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        products = list(
            Product.objects.select_related(
                "storage_location",
            ).filter(
                id__in=product_ids,
                is_active=True,
            ).order_by(
                "storage_location__code",
                "standard_code",
            )
        )

        if not products:
            return Response(
                {
                    "detail": "No se encontraron productos activos."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_buffer = build_product_labels_pdf(
            products=products,
        )

        return FileResponse(
            pdf_buffer,
            as_attachment=False,
            filename="product-labels.pdf",
            content_type="application/pdf",
        )


class ProformaPdfView(APIView):
    """
    Genera una proforma en PDF a partir de productos seleccionados en
    la pantalla de códigos de barra, con un cliente opcional.

    action = "create" a propósito: esta vista no es un ViewSet (no
    tiene ese atributo por defecto), y ModulePermission._codename()
    solo resuelve a add_<módulo> cuando ve action == "create" — sin
    esto, un POST caería en change_documents, que no existe. Ver
    apps/core/permissions.py.
    """

    action = "create"
    permission_classes = [DocumentsPermission]

    def post(self, request):
        product_ids = request.data.get("product_ids")

        if not isinstance(product_ids, list) or not product_ids:
            return Response(
                {
                    "product_ids": [
                        "Debe seleccionar al menos un producto."
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(product_ids) > MAX_PROFORMA_ITEMS:
            return Response(
                {
                    "product_ids": [
                        (
                            "No puede incluir más de "
                            f"{MAX_PROFORMA_ITEMS} productos "
                            "en una misma proforma."
                        ),
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalized_ids = []
        seen_ids = set()

        for product_id in product_ids:
            if (
                isinstance(product_id, bool)
                or not isinstance(product_id, int)
                or product_id <= 0
            ):
                return Response(
                    {
                        "product_ids": [
                            (
                                "Todos los identificadores deben "
                                "ser números enteros positivos."
                            ),
                        ],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if product_id not in seen_ids:
                seen_ids.add(product_id)
                normalized_ids.append(product_id)

        products_by_id = {
            product.id: product
            for product in with_latest_suggested_price(
                Product.objects.filter(id__in=normalized_ids)
            )
        }

        missing_ids = [
            product_id
            for product_id in normalized_ids
            if product_id not in products_by_id
        ]

        if missing_ids:
            return Response(
                {
                    "product_ids": [
                        (
                            "No existen productos con los "
                            "siguientes identificadores: "
                            + ", ".join(
                                str(product_id)
                                for product_id in missing_ids
                            )
                            + "."
                        ),
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        ordered_products = [
            products_by_id[product_id]
            for product_id in normalized_ids
        ]

        customer_id = request.data.get("customer_id")
        customer = None

        if customer_id is not None:
            if isinstance(customer_id, bool) or not isinstance(customer_id, int):
                return Response(
                    {
                        "customer_id": [
                            "El identificador del cliente debe ser un número entero.",
                        ],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                customer = Customer.objects.get(id=customer_id)
            except Customer.DoesNotExist:
                return Response(
                    {
                        "customer_id": [
                            "El cliente indicado no existe.",
                        ],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        pdf_buffer = build_proforma_pdf(
            products=ordered_products,
            customer=customer,
        )

        return FileResponse(
            pdf_buffer,
            as_attachment=True,
            filename="proforma.pdf",
            content_type="application/pdf",
        )


class SaleInvoicePdfView(APIView):
    """
    Comprobante interno de una venta confirmada. No es una factura
    electrónica ante el Ministerio de Hacienda — ver la nota al pie
    del propio PDF (build_sale_invoice_pdf).
    """

    permission_classes = [DocumentsPermission]

    def get(self, request, sale_id):
        try:
            sale = (
                Sale.objects
                .select_related("customer")
                .prefetch_related("items__product")
                .get(id=sale_id)
            )
        except Sale.DoesNotExist:
            return Response(
                {"detail": "La venta indicada no existe."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if sale.status != SaleStatus.CONFIRMED:
            return Response(
                {"detail": "Solo se puede generar el comprobante de ventas confirmadas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pdf_buffer = build_sale_invoice_pdf(sale=sale)

        return FileResponse(
            pdf_buffer,
            as_attachment=True,
            filename=f"factura-venta-{sale.id}.pdf",
            content_type="application/pdf",
        )


class ServiceInvoicePdfView(APIView):
    """
    Comprobante interno de un servicio entregado. No es una factura
    electrónica ante el Ministerio de Hacienda — ver la nota al pie
    del propio PDF (build_service_invoice_pdf).
    """

    permission_classes = [DocumentsPermission]

    def get(self, request, service_record_id):
        try:
            service_record = (
                InjectorServiceRecord.objects
                .select_related("injector", "injector__customer")
                .get(id=service_record_id)
            )
        except InjectorServiceRecord.DoesNotExist:
            return Response(
                {"detail": "El servicio indicado no existe."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if service_record.status != InjectorServiceStatus.DELIVERED:
            return Response(
                {"detail": "Solo se puede generar el comprobante de servicios entregados."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        accessories = list(
            service_record.accessories.select_related("product").all()
        )

        pdf_buffer = build_service_invoice_pdf(
            service_record=service_record,
            accessories=accessories,
        )

        return FileResponse(
            pdf_buffer,
            as_attachment=True,
            filename=f"factura-servicio-{service_record.id}.pdf",
            content_type="application/pdf",
        )