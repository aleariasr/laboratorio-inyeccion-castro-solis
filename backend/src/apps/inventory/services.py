from django.db import transaction

from .exceptions import (
    InvalidPurchaseStatusError,
    PurchaseAlreadyConfirmedError,
    PurchaseCancelledError,
    PurchaseWithoutItemsError,
    PurchaseCannotBeCancelledError,
)
from .models import Purchase, PurchaseStatus, StockMovement, StockMovementType


@transaction.atomic
def confirm_purchase(*, purchase: Purchase, user):
    """
    Confirma una compra e ingresa el inventario.
    """

    if purchase.status == PurchaseStatus.CONFIRMED:
        raise PurchaseAlreadyConfirmedError()

    if purchase.status == PurchaseStatus.CANCELLED:
        raise PurchaseCancelledError()

    items = list(
        purchase.items.select_related(
            "supplier_product__product"
        )
    )

    if not items:
        raise PurchaseWithoutItemsError()

    purchase.status = PurchaseStatus.CONFIRMED
    purchase.updated_by = user
    purchase.save(update_fields=["status", "updated_by", "updated_at"])

    for item in items:
        StockMovement.create_from_service(
            product=item.supplier_product.product,
            movement_type=StockMovementType.ENTRY,
            quantity=item.quantity,
            purchase_item=item,
            created_by=user,
            updated_by=user,
        )

    return purchase

def cancel_purchase(*, purchase: Purchase, user):
    """
    Anula una compra antes de que ingrese al inventario.
    """

    if purchase.status == PurchaseStatus.CONFIRMED:
        raise PurchaseCannotBeCancelledError()

    if purchase.status == PurchaseStatus.CANCELLED:
        return purchase

    purchase.status = PurchaseStatus.CANCELLED
    purchase.updated_by = user
    purchase.save(
        update_fields=[
            "status",
            "updated_by",
            "updated_at",
        ]
    )

    return purchase