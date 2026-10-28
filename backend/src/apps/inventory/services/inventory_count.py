from django.db import transaction

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import (
    InventoryCount,
    InventoryCountStatus,
    MovementDirection,
    StockMovement,
    StockMovementType,
)
from apps.inventory.selectors import current_stock, lock_products


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

    El conteo y sus productos quedan bloqueados mientras tanto: sin eso,
    dos aprobaciones a la vez registraban el ajuste dos veces (pasada
    previa a la 2.5.0).
    """

    inventory_count = InventoryCount.objects.select_for_update().get(
        pk=inventory_count.pk,
    )

    if inventory_count.status != InventoryCountStatus.DRAFT:
        raise InventoryError(
            "Solo un conteo en borrador puede aprobarse."
        )

    items = list(inventory_count.items.select_related("product"))

    lock_products(item.product_id for item in items)

    for item in items:

        stock = current_stock(item.product)

        difference = item.counted_quantity - stock

        if difference == 0:
            continue

        StockMovement.create_from_service(
            product=item.product,
            inventory_count=inventory_count,
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

@transaction.atomic
def cancel_inventory_count(
    *,
    inventory_count: InventoryCount,
    user,
):
    """
    Anula un conteo físico en borrador.

    Solo un conteo en borrador puede anularse: una vez aprobado, ya
    generó movimientos de ajuste y no debe revertirse desde aquí.
    """

    inventory_count = InventoryCount.objects.select_for_update().get(
        pk=inventory_count.pk,
    )

    if inventory_count.status != InventoryCountStatus.DRAFT:
        raise InventoryError(
            "Solo un conteo en borrador puede anularse."
        )

    inventory_count.status = InventoryCountStatus.CANCELLED
    inventory_count.updated_by = user

    inventory_count.save(
        update_fields=[
            "status",
            "updated_by",
            "updated_at",
        ]
    )

    return inventory_count