from django.db.models import DecimalField, F, OuterRef, Subquery

from apps.inventory.models import ProductCostHistory, PurchaseStatus

SUGGESTED_PRICE_DECIMAL_FIELD = DecimalField(max_digits=12, decimal_places=4)

# El cálculo que rige es el de la compra confirmada más reciente (P5 de la
# auditoría del 2026-11-07), no el último que se calculó: antes, si la
# compra B se calculaba después de la A pero la A se confirmaba después,
# el precio salía de la B. Las compras creadas ya confirmadas sin fecha de
# confirmación (datos viejos o de prueba) quedan al final y se desempatan
# por el cálculo más reciente.
CURRENT_COST_HISTORY_ORDERING = (
    F("purchase__confirmed_at").desc(nulls_last=True),
    F("calculated_at").desc(),
    F("id").desc(),
)


def _current_cost_history():
    """
    ProductCostHistory.suggested_price ya está en colones (desde la
    auditoría de compras en dólares, 2026-11-07; la migración 0030 pasó
    los cálculos viejos en dólares), igual que custom_sale_price, así que
    aquí ya no se convierte nada.

    Solo cuentan los cálculos de compras CONFIRMADAS: el precio de venta
    sale del costo de mercadería que de verdad entró. Así, un cálculo
    hecho sobre un borrador no mueve el precio hasta confirmar la compra,
    y al anular una compra el producto vuelve solo al precio de la compra
    anterior. Las filas de borradores y anuladas no se borran: siguen
    como histórico (ver ProductCostHistoryViewSet), solo dejan de definir
    el precio.
    """
    return ProductCostHistory.objects.filter(
        purchase__status=PurchaseStatus.CONFIRMED,
    ).order_by(*CURRENT_COST_HISTORY_ORDERING)


def latest_suggested_price(product):
    return (
        _current_cost_history()
        .filter(product=product)
        .values_list("suggested_price", flat=True)
        .first()
    )


def with_latest_suggested_price(queryset):
    latest_cost_history = _current_cost_history().filter(
        product=OuterRef("pk"),
    )

    return queryset.annotate(
        latest_suggested_price=Subquery(
            latest_cost_history.values("suggested_price")[:1],
            output_field=SUGGESTED_PRICE_DECIMAL_FIELD,
        ),
    )


def effective_sale_price(product):
    """
    custom_sale_price manda si está definido; si no, el último precio
    sugerido calculado (en colones). Usa la anotación de
    with_latest_suggested_price si el objeto ya la trae (evita una
    consulta extra), si no cae al selector de una sola consulta.
    """
    if product.custom_sale_price is not None:
        return product.custom_sale_price

    if hasattr(product, "latest_suggested_price"):
        return product.latest_suggested_price

    return latest_suggested_price(product)
