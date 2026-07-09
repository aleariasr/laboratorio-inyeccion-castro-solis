from django.db import transaction

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import (
    InventoryCount,
    InventoryCountStatus,
    MovementDirection,
    StockMovement,
    StockMovementType,
)
from apps.inventory.selectors import current_stock


@transaction.atomic
def approve_inventory_count(
    *,
    inventory_count: InventoryCount,
    user,
):
    """
    Aprueba un conteo físico.

    Por cada línea calcula la diferencia entre el
    inventario registrado y el inventario contado.

    Si existe diferencia genera automáticamente un
    movimiento de ajuste.
    """

    if inventory_count.status != InventoryCountStatus.DRAFT:
        raise InventoryError(
            "Solo un conteo en borrador puede aprobarse."
        )

    for item in inventory_count.items.select_related("product"):

        stock = current_stock(item.product)

        difference = item.counted_quantity - stock

        if difference == 0:
            continue

        StockMovement.create_from_service(
            product=item.product,
            movement_type=StockMovementType.ADJUSTMENT,
            direction=(
                MovementDirection.IN
                if difference > 0
                else MovementDirection.OUT
            ),
            quantity=abs(difference),
            notes=f"Conteo físico {inventory_count.reference}",
            created_by=user,
            updated_by=user,
        )

    inventory_count.status = InventoryCountStatus.APPROVED
    inventory_count.updated_by = user

    inventory_count.save(
        update_fields=[
            "status",
            "updated_by",
            "updated_at",
        ]
    )

    return inventory_count