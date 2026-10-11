from decimal import Decimal

from django.http import FileResponse
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.money import (
    DEFAULT_TAX_PERCENTAGE,
    DiscountType,
    DocumentAmountsError,
)
from apps.core.permissions import DocumentsPermission, ModuleAdminRequired
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
MAX_PROFORMA_QUANTITY = 9999


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


class ProformaAmountsSerializer(serializers.Serializer):
    """
    Descuento e impuesto de la proforma (punto 15). Opcionales: sin
    descuento, y con el IVA por defecto, igual que una venta o un
    servicio creados desde la pantalla.
    """

    discount_type = serializers.ChoiceField(
        choices=DiscountType.choices,
        default=DiscountType.AMOUNT,
    )
    discount_value = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=Decimal("0"),
        default=Decimal("0"),
    )
    tax_percentage = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0"),
        max_value=Decimal("100"),
        default=DEFAULT_TAX_PERCENTAGE,
    )


class ProformaPdfView(APIView):
    """
    Genera una proforma en PDF: una lista de productos con su cantidad,
    al precio de venta vigente, con un cliente opcional. Se arma desde
    Ventas (/sales/proforma) o desde la selección de la pantalla de
    Productos (cantidad 1 por producto).

    Cuerpo: {"items": [{"product_id": 1, "quantity": 2}, ...],
    "customer_id": 5 | null, "discount_type": "AMOUNT" | "PERCENT",
    "discount_value": "1000", "tax_percentage": "13"}. Si un producto se
    repite, sus cantidades se suman en una sola línea. Descuento e
    impuesto son opcionales (ver ProformaAmountsSerializer).

    action = "create" a propósito: esta vista no es un ViewSet (no
    tiene ese atributo por defecto), y ModulePermission._codename()
    solo resuelve a add_<módulo> cuando ve action == "create" — sin
    esto, un POST caería en change_documents, que no existe. Ver
    apps/core/permissions.py.
    """

    action = "create"
    permission_classes = [DocumentsPermission]

    def post(self, request):
        items = request.data.get("items")

        if not isinstance(items, list) or not items:
            return _items_error("Debe agregar al menos un producto.")

        if len(items) > MAX_PROFORMA_ITEMS:
            return _items_error(
                f"No puede incluir más de {MAX_PROFORMA_ITEMS} "
                "productos en una misma proforma."
            )

        quantities_by_id = {}

        for item in items:
            product_id = item.get("product_id") if isinstance(item, dict) else None
            quantity = item.get("quantity", 1) if isinstance(item, dict) else None

            if not _is_positive_int(product_id):
                return _items_error(
                    "Cada producto debe indicar un identificador entero positivo."
                )

            if (
                not _is_positive_int(quantity)
                or quantity > MAX_PROFORMA_QUANTITY
            ):
                return _items_error(
                    "La cantidad debe ser un número entero entre 1 y "
                    f"{MAX_PROFORMA_QUANTITY}."
                )

            # dict conserva el orden de inserción: el PDF sale en el
            # orden en que se agregaron, aunque un producto se repita.
            quantities_by_id[product_id] = (
                quantities_by_id.get(product_id, 0) + quantity
            )

        products_by_id = {
            product.id: product
            for product in with_latest_suggested_price(
                Product.objects.filter(id__in=quantities_by_id)
            )
        }

        missing_ids = [
            product_id
            for product_id in quantities_by_id
            if product_id not in products_by_id
        ]

        if missing_ids:
            return _items_error(
                "No existen productos con los siguientes identificadores: "
                + ", ".join(str(product_id) for product_id in missing_ids)
                + "."
            )

        ordered_items = [
            (products_by_id[product_id], quantity)
            for product_id, quantity in quantities_by_id.items()
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

        amounts_serializer = ProformaAmountsSerializer(data=request.data)
        amounts_serializer.is_valid(raise_exception=True)
        amount_settings = amounts_serializer.validated_data

        try:
            pdf_buffer = build_proforma_pdf(
                items=ordered_items,
                customer=customer,
                discount_type=amount_settings["discount_type"],
                discount_value=amount_settings["discount_value"],
                tax_percentage=amount_settings["tax_percentage"],
            )
        except DocumentAmountsError as exc:
            field_name = (
                "tax_percentage"
                if "impuesto" in str(exc)
                else "discount_value"
            )

            return Response(
                {field_name: [str(exc)]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return FileResponse(
            pdf_buffer,
            as_attachment=True,
            filename="proforma.pdf",
            content_type="application/pdf",
        )


def _is_positive_int(value):
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and value > 0
    )


def _items_error(message):
    return Response(
        {"items": [message]},
        status=status.HTTP_400_BAD_REQUEST,
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

    Trae el precio del servicio y de sus accesorios, que solo maneja el
    Administrador (punto 25): además de view_documents, exige ADMIN.
    """

    permission_classes = [DocumentsPermission, ModuleAdminRequired]

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