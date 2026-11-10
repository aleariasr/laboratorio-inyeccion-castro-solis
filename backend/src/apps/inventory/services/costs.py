from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from apps.inventory.exceptions import InventoryError
from apps.inventory.exchange_rates import (
    CRC_EXCHANGE_RATE,
    is_valid_usd_exchange_rate,
    to_crc,
)
from apps.inventory.models import (
    Currency,
    ProductCostHistory,
    Purchase,
    PurchaseStatus,
)

AMOUNT_QUANTUM = Decimal("0.0001")
FACTOR_QUANTUM = Decimal("0.000001")
# El precio de venta sugerido se redondea a dos decimales de colón
# (decisión de Alejandro, 2026-11-07).
PRICE_QUANTUM = Decimal("0.01")

# Un cálculo se puede rehacer (con otro margen) en borrador o ya
# confirmada: las líneas y los costos de una confirmada no cambian, solo
# el margen. En una anulada no tiene sentido.
CALCULABLE_STATUSES = {PurchaseStatus.DRAFT, PurchaseStatus.CONFIRMED}


def _quantize(value: Decimal, quantum: Decimal) -> Decimal:
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


def _money(value: Decimal) -> Decimal:
    return _quantize(value, AMOUNT_QUANTUM)


def _price(value: Decimal) -> Decimal:
    return _quantize(value, PRICE_QUANTUM)


def _apply_margin(value: Decimal, margin_percentage: Decimal) -> Decimal:
    return value * (Decimal("1") + (margin_percentage / Decimal("100")))


def purchase_exchange_rate(purchase: Purchase) -> Decimal:
    """
    Tipo de cambio con que se pasan a colones las líneas de la compra.

    En una compra en dólares tiene que ser un valor real de ₡ por US$1:
    con el 1 que quedaba al cambiar la moneda en el formulario, todo el
    cálculo salía en "colones" que en realidad eran dólares.
    """

    if purchase.currency != Currency.USD:
        return CRC_EXCHANGE_RATE

    if not is_valid_usd_exchange_rate(purchase.exchange_rate):
        raise InventoryError(
            "La compra está en dólares con un tipo de cambio que no es "
            f"válido ({purchase.exchange_rate}). Corresponde corregirlo "
            "antes de calcular los costos."
        )

    return purchase.exchange_rate


def _import_cost_in_crc(cost) -> Decimal:
    """
    Un costo de importación en colones, convertido una sola vez con el
    tipo de cambio con que se pagó ese costo (ver exchange_rates).
    """

    if cost.currency == Currency.USD and not is_valid_usd_exchange_rate(
        cost.exchange_rate
    ):
        raise InventoryError(
            f"El costo «{cost.category.name}» está en dólares con un tipo "
            f"de cambio que no es válido ({cost.exchange_rate}). "
            "Corresponde corregirlo antes de calcular los costos."
        )

    return to_crc(cost.amount, cost.currency, cost.exchange_rate)


def _calculate_item_cost(item, exchange_rate, cost_factor, margin_percentage):
    """
    Costo final y precio sugerido de una línea, los dos en colones.

    Se usa tanto en el resumen de vista previa (purchase_cost_summary)
    como al aplicar los costos (calculate_purchase_costs), para que ambos
    coincidan siempre.
    """

    unit_cost_crc = item.unit_cost * exchange_rate
    final_unit_cost = _money(unit_cost_crc * cost_factor)
    suggested_price = _price(_apply_margin(final_unit_cost, margin_percentage))

    return _money(unit_cost_crc), final_unit_cost, suggested_price


def _products_breakdown(items, exchange_rate, cost_factor, margin_percentage):
    """
    Costo y precio sugerido de cada producto de la compra, en el orden en
    que aparece por primera vez.

    Un mismo producto puede venir en varias líneas con costos distintos
    (por ejemplo, de dos bodegas del proveedor; pedido del 2026-11-10).
    Como tiene un solo precio de venta, se usa el costo promedio ponderado
    por cantidad:

        costo unitario promedio = Σ(costo unitario × cantidad) / Σ cantidad
        costo final ₡ = costo promedio × tipo de cambio × factor
        precio sugerido ₡ = costo final ₡ × (1 + margen / 100)

    Con una sola línea el promedio es su propio costo unitario, así que el
    resultado es el mismo de antes.
    """

    grouped = {}

    for item in items:
        product = item.supplier_product.product
        entry = grouped.setdefault(
            product.id,
            {
                "product": product,
                "quantity": 0,
                "total_original": Decimal("0"),
                "line_count": 0,
            },
        )
        entry["quantity"] += item.quantity
        entry["total_original"] += item.unit_cost * item.quantity
        entry["line_count"] += 1

    breakdown = []

    for entry in grouped.values():
        product = entry["product"]
        average_unit_cost = entry["total_original"] / entry["quantity"]
        final_unit_cost = _money(average_unit_cost * exchange_rate * cost_factor)

        breakdown.append(
            {
                "product": product.id,
                "standard_code": product.standard_code,
                "name": product.name,
                "quantity": entry["quantity"],
                "line_count": entry["line_count"],
                "original_unit_cost": _money(average_unit_cost),
                "final_unit_cost": final_unit_cost,
                "suggested_price": _price(
                    _apply_margin(final_unit_cost, margin_percentage)
                ),
            }
        )

    return breakdown


@transaction.atomic
def discard_purchase_cost_calculation(*, purchase: Purchase):
    """
    Borra el cálculo de costos guardado de una compra en borrador y
    devuelve cuántas filas borró.

    Cualquier cambio en las líneas, en los costos de importación, en la
    moneda o en el tipo de cambio cambia el costo de toda la factura, así
    que el cálculo anterior queda obsoleto. Si se dejara, al confirmar la
    compra el producto quedaría con un precio sugerido que ya no
    corresponde, incluso el de una línea que se borró. Por eso se borra el
    cálculo completo de la compra, no solo la fila del producto afectado.

    En una compra confirmada o anulada no hace nada: ahí el histórico es
    el registro de lo que efectivamente se aplicó.
    """

    if purchase.status != PurchaseStatus.DRAFT:
        return 0

    deleted, _ = ProductCostHistory.objects.filter(
        purchase=purchase,
    ).delete()

    return deleted


def purchase_cost_summary(
    *,
    purchase: Purchase,
    margin_percentage: Decimal,
):
    """
    Costo de la compra y precio sugerido por línea, todo en colones
    (auditoría de compras en dólares, 2026-11-07).

    Cada monto se pasa a colones una sola vez, con el tipo de cambio del
    documento donde se pagó: las líneas con el de la compra, cada costo de
    importación con el suyo. Antes todo se llevaba a la moneda de la
    compra con el tipo de cambio de cada costo y al final se pasaba a
    colones con el de la compra, así que un flete pagado en colones en una
    compra en dólares terminaba valiendo otra cantidad de colones.

        factor = (subtotal ₡ + costos ₡) / subtotal ₡
        costo final ₡ = costo unitario × tipo de cambio de la compra × factor
        precio sugerido ₡ = costo final ₡ × (1 + margen / 100), a 2 decimales
    """

    items = list(
        purchase.items.select_related(
            "supplier_product__product",
        )
    )

    invoice_subtotal_original = sum(
        (
            item.unit_cost * item.quantity
            for item in items
        ),
        Decimal("0"),
    )

    if invoice_subtotal_original <= 0:
        raise InventoryError(
            "El subtotal de la compra debe ser mayor que cero."
        )

    exchange_rate = purchase_exchange_rate(purchase)
    invoice_subtotal = invoice_subtotal_original * exchange_rate

    import_costs = list(
        purchase.import_costs.filter(is_active=True).select_related("category")
    )

    import_costs_breakdown = []
    import_costs_total = Decimal("0")

    for cost in import_costs:
        amount_crc = _import_cost_in_crc(cost)
        import_costs_total += amount_crc

        import_costs_breakdown.append(
            {
                "id": cost.id,
                "category": cost.category.name,
                "description": cost.description,
                "amount": cost.amount,
                "currency": cost.currency,
                "exchange_rate": cost.exchange_rate,
                "amount_crc": _money(amount_crc),
            }
        )

    total_cost = invoice_subtotal + import_costs_total
    # Se redondea igual que el campo cost_factor del histórico, para que
    # el resumen y lo que queda guardado coincidan al último decimal.
    cost_factor = _quantize(total_cost / invoice_subtotal, FACTOR_QUANTUM)

    products_breakdown = _products_breakdown(
        items,
        exchange_rate,
        cost_factor,
        margin_percentage,
    )
    products_by_id = {
        product_line["product"]: product_line
        for product_line in products_breakdown
    }

    items_breakdown = []

    for item in items:
        product = item.supplier_product.product
        product_line = products_by_id[product.id]

        unit_cost_crc, final_unit_cost, _ = _calculate_item_cost(
            item,
            exchange_rate,
            cost_factor,
            margin_percentage,
        )

        items_breakdown.append(
            {
                "id": item.id,
                "supplier_product": item.supplier_product_id,
                "product": product.id,
                "standard_code": product.standard_code,
                "name": product.name,
                "reference": item.reference,
                "quantity": item.quantity,
                "original_unit_cost": item.unit_cost,
                "original_unit_cost_crc": unit_cost_crc,
                # Costo final de esta línea.
                "final_unit_cost": final_unit_cost,
                # Precio del producto: si viene en varias líneas, sale del
                # costo promedio de todas (ver _products_breakdown).
                "suggested_price": product_line["suggested_price"],
                "is_repeated": product_line["line_count"] > 1,
            }
        )

    return {
        "purchase": purchase.id,
        "currency": purchase.currency,
        "exchange_rate": exchange_rate,
        "invoice_subtotal_original": _money(invoice_subtotal_original),
        "invoice_subtotal": _money(invoice_subtotal),
        "import_costs_total": _money(import_costs_total),
        "total_cost": _money(total_cost),
        "cost_factor": cost_factor,
        "margin_percentage": margin_percentage,
        "suggested_total": _price(_apply_margin(total_cost, margin_percentage)),
        "import_costs": import_costs_breakdown,
        "items": items_breakdown,
        "products": products_breakdown,
    }


@transaction.atomic
def calculate_purchase_costs(
    *,
    purchase: Purchase,
    margin_percentage: Decimal,
    user,
):
    """
    Guarda el costo final y el precio sugerido (en colones) de cada
    producto de la compra; uno que viene en varias líneas queda con el
    costo promedio de todas (ver _products_breakdown).

    Reemplaza el cálculo anterior de la misma compra: antes cada "Aplicar
    costos" agregaba otra fila por producto y el histórico mostraba
    cálculos repetidos con márgenes distintos.
    """

    purchase = (
        Purchase.objects.select_for_update()
        .get(pk=purchase.pk)
    )

    if purchase.status not in CALCULABLE_STATUSES:
        raise InventoryError(
            "Los costos de una compra anulada no se calculan."
        )

    summary = purchase_cost_summary(
        purchase=purchase,
        margin_percentage=margin_percentage,
    )

    ProductCostHistory.objects.filter(purchase=purchase).delete()

    products = {
        item.supplier_product.product_id: item.supplier_product.product
        for item in purchase.items.select_related(
            "supplier_product__product",
        )
    }

    histories = []

    # Una fila por producto, aunque venga en varias líneas: el producto
    # tiene un solo precio de venta.
    for line in summary["products"]:
        histories.append(
            ProductCostHistory.objects.create(
                product=products[line["product"]],
                purchase=purchase,
                original_unit_cost=line["original_unit_cost"],
                cost_factor=summary["cost_factor"],
                final_unit_cost=line["final_unit_cost"],
                currency=purchase.currency,
                exchange_rate=summary["exchange_rate"],
                margin_percentage=margin_percentage,
                suggested_price=line["suggested_price"],
                created_by=user,
                updated_by=user,
            )
        )

    return histories
