from django.db import transaction
from django.utils import timezone

from apps.inventory.models import (
    MovementDirection,
    StockMovement,
    StockMovementType,
)
from apps.inventory.selectors import current_stock
from apps.sales.exceptions import (
    InsufficientStockError,
    SaleAlreadyCancelledError,
    SaleAlreadyConfirmedError,
    SaleCancelledError,
    SaleNotConfirmedError,
    SaleWithoutItemsError,
)
from apps.sales.models import Sale, SaleStatus


@transaction.atomic
def confirm_sale(*, sale: Sale, user):
    sale = Sale.objects.select_for_update().get(
        pk=sale.pk,
    )

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
    sale.confirmed_at = timezone.now()
    sale.confirmed_by = user
    sale.updated_by = user

    sale.save(
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
            product=item.product,
            movement_type=StockMovementType.EXIT,
            direction=MovementDirection.OUT,
            quantity=item.quantity,
            notes=f"Venta #{sale.id}",
            created_by=user,
            updated_by=user,
            sale_item=item,
        )

    return sale


@transaction.atomic
def cancel_sale(
    *,
    sale: Sale,
    user,
    reason: str,
):
    normalized_reason = reason.strip()

    if not normalized_reason:
        raise ValueError(
            "El motivo de anulación es obligatorio."
        )

    sale = Sale.objects.select_for_update().get(
        pk=sale.pk,
    )

    if sale.status == SaleStatus.DRAFT:
        raise SaleNotConfirmedError()

    if sale.status == SaleStatus.CANCELLED:
        raise SaleAlreadyCancelledError()

    items = list(
        sale.items.select_related("product").prefetch_related(
            "stock_movements",
        )
    )

    reversal_data = []

    for item in items:
        original_movement = item.stock_movements.get(
            movement_type=StockMovementType.EXIT,
            direction=MovementDirection.OUT,
            reverses_movement__isnull=True,
        )

        reversal_data.append(
            (
                item,
                original_movement,
            )
        )

    for item, original_movement in reversal_data:
        StockMovement.create_from_service(
            product=item.product,
            movement_type=StockMovementType.REVERSAL,
            direction=MovementDirection.IN,
            quantity=original_movement.quantity,
            notes=(
                f"Anulación de venta #{sale.id}: "
                f"{normalized_reason}"
            ),
            created_by=user,
            updated_by=user,
            sale_item=item,
            reverses_movement=original_movement,
        )

    sale.status = SaleStatus.CANCELLED
    sale.cancelled_at = timezone.now()
    sale.cancelled_by = user
    sale.cancellation_reason = normalized_reason
    sale.updated_by = user

    sale.save(
        update_fields=[
            "status",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
            "updated_by",
            "updated_at",
        ]
    )

    return sale