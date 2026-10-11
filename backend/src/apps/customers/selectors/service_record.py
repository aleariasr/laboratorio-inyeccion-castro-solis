from apps.core.money import DocumentAmounts, compute_document_amounts
from apps.customers.models import InjectorServiceRecord, InjectorServiceStatus


def delivered_services():
    """
    Los servicios que cuentan como dinero: entregados y activos. La caja y
    los reportes usan esta misma definición (punto 20), así cuadran.
    """

    return InjectorServiceRecord.objects.filter(
        status=InjectorServiceStatus.DELIVERED,
        is_active=True,
    )


def live_service_amounts(service_record):
    """
    Montos calculados ahora: price es el subtotal (mano de obra +
    accesorios), con el descuento y el impuesto del servicio. None si
    todavía no tiene precio. Lanza DocumentAmountsError si el descuento
    es mayor que el precio.
    """

    if service_record.price is None:
        return None

    return compute_document_amounts(
        service_record.price,
        service_record.discount_type,
        service_record.discount_value,
        service_record.tax_percentage,
    )


def service_amounts(service_record):
    """
    Entregado: los montos congelados al entregar (lo que se cobró).
    Antes: calculados en vivo (ver live_service_amounts). Mismo criterio
    que apps.sales.selectors.sale_amounts.
    """

    if service_record.total_amount is not None:
        return DocumentAmounts(
            subtotal=service_record.subtotal_amount,
            discount_amount=service_record.discount_amount,
            taxable_base=(
                service_record.subtotal_amount
                - service_record.discount_amount
            ),
            tax_amount=service_record.tax_amount,
            total=service_record.total_amount,
        )

    return live_service_amounts(service_record)
