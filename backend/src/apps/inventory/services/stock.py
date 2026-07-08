from django.db import transaction

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import (
    Product,
    StockMovement,
    StockMovementType,
)


@transaction.atomic
def initial_inventory(
    *,
    product: Product,
    quantity: int,
    user,
    notes: str = "",
):
    """
    Registra el inventario inicial de un producto.

    Solo puede ejecutarse una vez por producto.
    """

    if quantity <= 0:
        raise InventoryError(
            "La cantidad debe ser mayor que cero."
        )

    if product.stock_movements.exists():
        raise InventoryError(
            "El producto ya posee movimientos de inventario."
        )

    return StockMovement.create_from_service(
        product=product,
        movement_type=StockMovementType.INITIAL,
        quantity=quantity,
        notes=notes,
        created_by=user,
        updated_by=user,
    )