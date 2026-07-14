from django.db import transaction
from django.utils import timezone

from apps.inventory.exceptions import (
    InsufficientStockForPurchaseReversalError,
    PurchaseAlreadyConfirmedError,
    PurchaseCancelledError,
    PurchaseWithoutItemsError,
)
from apps.inventory.models import (
    MovementDirection,
    Purchase,
    PurchaseStatus,
    StockMovement,
    StockMovementType,
)
from apps.inventory.selectors import current_stock


@transaction.atomic
def confirm_purchase(*, purchase: Purchase, user):
    purchase = (
        Purchase.objects.select_for_update()
        .select_related("supplier")
        .get(pk=purchase.pk)
    )

    if purchase.status == PurchaseStatus.CONFIRMED:
        raise PurchaseAlreadyConfirmedError()

    if purchase.status == PurchaseStatus.CANCELLED:
        raise PurchaseCancelledError()

    items = list(
        purchase.items.select_related(
            "supplier_product__product",
        )
    )

    if not items:
        raise PurchaseWithoutItemsError()

    purchase.status = PurchaseStatus.CONFIRMED
    purchase.confirmed_at = timezone.now()
    purchase.confirmed_by = user
    purchase.updated_by = user

    purchase.save(
        update_fields=[
            "status",
            "confirmed_at",
            "confirmed_by",
            "updated_by",
            "updated_at",
        ]
    )

    for item in items:
        StockMovement.create_from_service(
            product=item.supplier_product.product,
            movement_type=StockMovementType.ENTRY,
            direction=MovementDirection.IN,
            quantity=item.quantity,
            purchase_item=item,
            created_by=user,
            updated_by=user,
        )

    return purchase


@transaction.atomic
def cancel_purchase(
    *,
    purchase: Purchase,
    user,
    reason: str,
):
    normalized_reason = reason.strip()

    if not normalized_reason:
        raise ValueError(
            "El motivo de anulación es obligatorio."
        )

    purchase = (
        Purchase.objects.select_for_update()
        .select_related("supplier")
        .get(pk=purchase.pk)
    )

    if purchase.status == PurchaseStatus.CANCELLED:
        raise PurchaseCancelledError()

    if purchase.status == PurchaseStatus.CONFIRMED:
        items = list(
            purchase.items.select_related(
                "supplier_product__product",
            ).prefetch_related(
                "stock_movements",
            )
        )

        reversal_data = []

        for item in items:
            product = item.supplier_product.product

            original_movement = item.stock_movements.get(
                movement_type=StockMovementType.ENTRY,
                direction=MovementDirection.IN,
                reverses_movement__isnull=True,
            )

            available_stock = current_stock(product)

            if available_stock < original_movement.quantity:
                raise InsufficientStockForPurchaseReversalError(
                    (
                        "No existe inventario suficiente para "
                        f"revertir el producto {product.standard_code}."
                    )
                )

            reversal_data.append(
                (
                    product,
                    item,
                    original_movement,
                )
            )

        for product, item, original_movement in reversal_data:
            StockMovement.create_from_service(
                product=product,
                movement_type=StockMovementType.REVERSAL,
                direction=MovementDirection.OUT,
                quantity=original_movement.quantity,
                purchase_item=item,
                reverses_movement=original_movement,
                notes=(
                    f"Anulación de compra "
                    f"{purchase.invoice_number}: "
                    f"{normalized_reason}"
                ),
                created_by=user,
                updated_by=user,
            )

    purchase.status = PurchaseStatus.CANCELLED
    purchase.cancelled_at = timezone.now()
    purchase.cancelled_by = user
    purchase.cancellation_reason = normalized_reason
    purchase.updated_by = user

    purchase.save(
        update_fields=[
            "status",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
            "updated_by",
            "updated_at",
        ]
    )

    return purchase