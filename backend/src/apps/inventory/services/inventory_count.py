from django.db import transaction

from apps.inventory.models import (
    InventoryCount,
    InventoryCountStatus,
)


@transaction.atomic
def approve_inventory_count(
    *,
    inventory_count: InventoryCount,
    user,
):
    """
    Aprueba un conteo físico.

    Por ahora únicamente cambia el estado.
    En el siguiente paso generaremos automáticamente
    los movimientos de ajuste.
    """

    if inventory_count.status != InventoryCountStatus.DRAFT:
        raise ValueError(
            "Solo un conteo en borrador puede aprobarse."
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