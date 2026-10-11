from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import Coalesce

from apps.core.money import DocumentAmounts, compute_document_amounts
from apps.sales.models import Sale, SaleItem, SaleStatus


def sale_total(sale: Sale):
    return (
        sale.items.aggregate(
            total=Coalesce(
                Sum(
                    ExpressionWrapper(
                        F("quantity") * F("unit_price"),
                        output_field=DecimalField(
                            max_digits=14,
                            decimal_places=4,
                        ),
                    )
                ),
                0,
                output_field=DecimalField(
                    max_digits=14,
                    decimal_places=4,
                ),
            )
        )["total"]
    )


def live_sale_amounts(sale: Sale):
    """
    Montos calculados ahora con las líneas y el descuento e impuesto de
    la venta. Lanza DocumentAmountsError si el descuento quedó mayor que
    el subtotal (por ejemplo, después de quitar líneas).
    """

    return compute_document_amounts(
        sale_total(sale),
        sale.discount_type,
        sale.discount_value,
        sale.tax_percentage,
    )


def sale_amounts(sale: Sale):
    """
    Confirmada o anulada: los montos congelados al confirmar (lo que se
    cobró). Borrador: calculados en vivo (ver live_sale_amounts).
    """

    if sale.total_amount is not None:
        return DocumentAmounts(
            subtotal=sale.subtotal_amount,
            discount_amount=sale.discount_amount,
            taxable_base=sale.subtotal_amount - sale.discount_amount,
            tax_amount=sale.tax_amount,
            total=sale.total_amount,
        )

    return live_sale_amounts(sale)


def confirmed_sales():
    """
    Las ventas que cuentan como dinero: confirmadas y activas. La caja y
    los reportes usan esta misma definición (punto 20), así cuadran.
    """

    return Sale.objects.filter(
        status=SaleStatus.CONFIRMED,
        is_active=True,
    ).order_by("-sale_date", "-id")


def sale_items_for_product(product):
    return (
        SaleItem.objects.filter(
            product=product,
            sale__status=SaleStatus.CONFIRMED,
            sale__is_active=True,
        )
        .select_related("sale", "product")
        .order_by("-sale__sale_date", "-id")
    )