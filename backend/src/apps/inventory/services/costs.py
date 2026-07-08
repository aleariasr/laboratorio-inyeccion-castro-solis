from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from apps.inventory.models import ProductCostHistory, Purchase


def _money(value: Decimal) -> Decimal:
    return value.quantize(
        Decimal("0.0001"),
        rounding=ROUND_HALF_UP,
    )


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

    invoice_subtotal = sum(
        item.unit_cost * item.quantity
        for item in items
    )

    if invoice_subtotal <= 0:
        raise ValueError(
            "El subtotal de la compra debe ser mayor que cero."
        )

    import_costs_total = sum(
        cost.amount
        for cost in purchase.import_costs.filter(is_active=True)
    )

    total_cost = invoice_subtotal + import_costs_total
    cost_factor = total_cost / invoice_subtotal

    histories = []

    for item in items:
        product = item.supplier_product.product
        final_unit_cost = _money(item.unit_cost * cost_factor)

        suggested_price = _money(
            final_unit_cost
            * (
                Decimal("1")
                + (margin_percentage / Decimal("100"))
            )
        )

        history, _ = ProductCostHistory.objects.update_or_create(
            product=product,
            purchase=purchase,
            defaults={
                "original_unit_cost": item.unit_cost,
                "cost_factor": cost_factor,
                "final_unit_cost": final_unit_cost,
                "currency": purchase.currency,
                "exchange_rate": purchase.exchange_rate,
                "margin_percentage": margin_percentage,
                "suggested_price": suggested_price,
                "created_by": user,
                "updated_by": user,
            },
        )

        histories.append(history)

    return histories