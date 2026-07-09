from django.db import transaction

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import (
    MovementDirection,
    Product,
    StockMovement,
    StockMovementType,
)
from apps.inventory.selectors import current_stock


@transaction.atomic
def initial_inventory(
    *,
    product: Product,
    quantity: int,
    user,
    notes: str = "",
):
    if quantity <= 0:
        raise InventoryError(
            "La cantidad debe ser mayor que cero."
        )

    if product.stock_movements.exists():
        raise InventoryError(
            "El producto ya posee movimientos."
        )

    return StockMovement.create_from_service(
        product=product,
        movement_type=StockMovementType.INITIAL,
        direction=MovementDirection.IN,
        quantity=quantity,
        notes=notes,
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def adjust_stock(
    *,
    product: Product,
    quantity: int,
    user,
    notes: str,
):
    if quantity == 0:
        raise InventoryError(
            "El ajuste no puede ser cero."
        )

    available_stock = current_stock(product)

    if quantity < 0 and abs(quantity) > available_stock:
        raise InventoryError(
            "El ajuste no puede dejar el inventario en negativo."
        )

    direction = (
        MovementDirection.IN
        if quantity > 0
        else MovementDirection.OUT
    )

    return StockMovement.create_from_service(
        product=product,
        movement_type=StockMovementType.ADJUSTMENT,
        direction=direction,
        quantity=abs(quantity),
        notes=notes,
        created_by=user,
        updated_by=user,
    )