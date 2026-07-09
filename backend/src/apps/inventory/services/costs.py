from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import ProductCostHistory, Purchase


def _money(value: Decimal) -> Decimal:
    return value.quantize(
        Decimal("0.0001"),
        rounding=ROUND_HALF_UP,
    )

def purchase_cost_summary(
    *,
    purchase: Purchase,
    margin_percentage: Decimal,
):
    items = list(
        purchase.items.all()
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
            cost.amount
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
        product = item.supplier_product.product
        final_unit_cost = _money(item.unit_cost * cost_factor)

        suggested_price = _money(
            final_unit_cost
            * (
                Decimal("1")
                + (margin_percentage / Decimal("100"))
            )
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