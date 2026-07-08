from django.db import transaction

from apps.inventory.models import (
    MovementDirection,
    StockMovement,
    StockMovementType,
)
from apps.inventory.selectors import current_stock
from apps.sales.exceptions import (
    InsufficientStockError,
    SaleAlreadyConfirmedError,
    SaleCancelledError,
    SaleWithoutItemsError,
)
from apps.sales.models import Sale, SaleStatus


@transaction.atomic
def confirm_sale(*, sale: Sale, user):
    if sale.status == SaleStatus.CONFIRMED:
        raise SaleAlreadyConfirmedError()

    if sale.status == SaleStatus.CANCELLED:
        raise SaleCancelledError()

    items = list(
        sale.items.select_related("product")
    )

    if not items:
        raise SaleWithoutItemsError()

    for item in items:
        available = current_stock(item.product)

        if item.quantity > available:
            raise InsufficientStockError(
                "No hay inventario suficiente."
            )

    sale.status = SaleStatus.CONFIRMED
    sale.updated_by = user
    sale.save(
        update_fields=[
            "status",
            "updated_by",
            "updated_at",
        ]
    )

    for item in items:
        StockMovement.create_from_service(
            product=item.product,
            movement_type=StockMovementType.EXIT,
            direction=MovementDirection.OUT,
            quantity=item.quantity,
            notes=f"Venta #{sale.id}",
            created_by=user,
            updated_by=user,
        )

    return sale