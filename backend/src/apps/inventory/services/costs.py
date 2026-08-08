from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import Currency, ProductCostHistory, Purchase


def _money(value: Decimal) -> Decimal:
    return value.quantize(
        Decimal("0.0001"),
        rounding=ROUND_HALF_UP,
    )


def _convert_import_cost_to_purchase_currency(cost, purchase_currency):
    """
    El tipo de cambio siempre se expresa como colones por dólar
    (igual que Purchase.exchange_rate), sin importar cuál de las
    dos monedas es la del costo y cuál la de la compra.
    """

    if cost.currency == purchase_currency:
        return cost.amount

    if cost.currency == Currency.CRC and purchase_currency == Currency.USD:
        return cost.amount / cost.exchange_rate

    if cost.currency == Currency.USD and purchase_currency == Currency.CRC:
        return cost.amount * cost.exchange_rate

    return cost.amount


def _calculate_item_cost(item, cost_factor, margin_percentage):
    """
    Costo final y precio sugerido de una línea individual de compra.

    Se usa tanto en el resumen de vista previa (purchase_cost_summary)
    como al aplicar los costos de forma definitiva
    (calculate_purchase_costs), para que ambos coincidan siempre.
    """

    product = item.supplier_product.product

    final_unit_cost = _money(item.unit_cost * cost_factor)

    suggested_price = _money(
        final_unit_cost
        * (
            Decimal("1")
            + (margin_percentage / Decimal("100"))
        )
    )

    return product, final_unit_cost, suggested_price


def purchase_cost_summary(
    *,
    purchase: Purchase,
    margin_percentage: Decimal,
):
    items = list(
        purchase.items.select_related(
            "supplier_product__product",
        )
    )

    invoice_subtotal = sum(
        (
            item.unit_cost * item.quantity
            for item in items
        ),
        Decimal("0"),
    )

    if invoice_subtotal <= 0:
        raise InventoryError(
            "El subtotal de la compra debe ser mayor que cero."
        )

    import_costs_total = sum(
        (
            _convert_import_cost_to_purchase_currency(cost, purchase.currency)
            for cost in purchase.import_costs.filter(is_active=True)
        ),
        Decimal("0"),
    )

    total_cost = invoice_subtotal + import_costs_total
    cost_factor = total_cost / invoice_subtotal

    suggested_total = _money(
        total_cost
        * (
            Decimal("1")
            + (margin_percentage / Decimal("100"))
        )
    )

    items_breakdown = []

    for item in items:
        product, final_unit_cost, suggested_price = _calculate_item_cost(
            item,
            cost_factor,
            margin_percentage,
        )

        items_breakdown.append(
            {
                "supplier_product": item.supplier_product_id,
                "product": product.id,
                "standard_code": product.standard_code,
                "name": product.name,
                "quantity": item.quantity,
                "original_unit_cost": item.unit_cost,
                "final_unit_cost": final_unit_cost,
                "suggested_price": suggested_price,
            }
        )

    return {
        "purchase": purchase.id,
        "invoice_subtotal": _money(invoice_subtotal),
        "import_costs_total": _money(import_costs_total),
        "total_cost": _money(total_cost),
        "cost_factor": cost_factor,
        "margin_percentage": margin_percentage,
        "suggested_total": suggested_total,
        "currency": purchase.currency,
        "exchange_rate": purchase.exchange_rate,
        "items": items_breakdown,
    }


@transaction.atomic
def calculate_purchase_costs(
    *,
    purchase: Purchase,
    margin_percentage: Decimal,
    user,
):
    items = list(
        purchase.items.select_related(
            "supplier_product__product",
        )
    )

    summary = purchase_cost_summary(
        purchase=purchase,
        margin_percentage=margin_percentage,
    )

    cost_factor = summary["cost_factor"]

    histories = []

    for item in items:
        product, final_unit_cost, suggested_price = _calculate_item_cost(
            item,
            cost_factor,
            margin_percentage,
        )

        history = ProductCostHistory.objects.create(
            product=product,
            purchase=purchase,
            original_unit_cost=item.unit_cost,
            cost_factor=cost_factor,
            final_unit_cost=final_unit_cost,
            currency=purchase.currency,
            exchange_rate=purchase.exchange_rate,
            margin_percentage=margin_percentage,
            suggested_price=suggested_price,
            created_by=user,
            updated_by=user,
        )

        histories.append(history)

    return histories
