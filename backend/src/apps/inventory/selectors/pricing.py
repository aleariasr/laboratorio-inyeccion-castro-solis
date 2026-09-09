from django.db.models import Case, DecimalField, F, OuterRef, Subquery, When
from django.db.models.functions import Cast

from apps.inventory.models import Currency, ProductCostHistory

SUGGESTED_PRICE_DECIMAL_FIELD = DecimalField(max_digits=12, decimal_places=4)


def _cost_history_with_suggested_price_in_crc():
    """
    ProductCostHistory.suggested_price se calcula en la moneda de la
    compra (CRC o USD, ver Purchase.currency). custom_sale_price (el
    otro lado de "precio efectivo") no tiene moneda propia, siempre
    se asume en colones (mismo criterio que InjectorServiceRecord.price).
    Para que ambos sean comparables/combinables, esta conversión deja
    el sugerido siempre en colones usando el exchange_rate vigente en
    esa compra.
    """
    return ProductCostHistory.objects.annotate(
        suggested_price_crc=Cast(
            Case(
                When(
                    currency=Currency.USD,
                    then=F("suggested_price") * F("exchange_rate"),
                ),
                default=F("suggested_price"),
            ),
            output_field=SUGGESTED_PRICE_DECIMAL_FIELD,
        ),
    )


def latest_suggested_price(product):
    return (
        _cost_history_with_suggested_price_in_crc()
        .filter(product=product)
        .order_by("-calculated_at", "-id")
        .values_list("suggested_price_crc", flat=True)
        .first()
    )


def with_latest_suggested_price(queryset):
    latest_cost_history = (
        _cost_history_with_suggested_price_in_crc()
        .filter(product=OuterRef("pk"))
        .order_by("-calculated_at", "-id")
    )

    return queryset.annotate(
        latest_suggested_price=Subquery(
            latest_cost_history.values("suggested_price_crc")[:1],
            output_field=SUGGESTED_PRICE_DECIMAL_FIELD,
        ),
    )


def effective_sale_price(product):
    """
    custom_sale_price manda si está definido; si no, el último precio
    sugerido calculado (ya en colones). Usa la anotación de
    with_latest_suggested_price si el objeto ya la trae (evita una
    consulta extra), si no cae al selector de una sola consulta.
    """
    if product.custom_sale_price is not None:
        return product.custom_sale_price

    if hasattr(product, "latest_suggested_price"):
        return product.latest_suggested_price

    return latest_suggested_price(product)
