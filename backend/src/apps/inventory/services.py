from django.db import transaction

from .exceptions import (
    InvalidPurchaseStateError,
)
from .models import (
    PurchaseStatus,
    StockMovement,
    StockMovementType,
)
from .validators import validate_purchase_has_items


@transaction.atomic
def confirm_purchase(purchase):
    """
    Confirma una compra y genera
    los movimientos de inventario.
    """

    if purchase.status != PurchaseStatus.DRAFT:
        raise InvalidPurchaseStateError(
            "Solo las compras en borrador pueden confirmarse."
        )

    validate_purchase_has_items(purchase)

    for item in purchase.items.select_related(
        "supplier_product__product"
    ):
        StockMovement.objects.create(
            product=item.supplier_product.product,
            movement_type=StockMovementType.ENTRY,
            quantity=item.quantity,
            purchase_item=item,
            created_by=purchase.created_by,
            updated_by=purchase.updated_by,
        )

    purchase.status = PurchaseStatus.CONFIRMED
    purchase.save(update_fields=["status", "updated_at"])