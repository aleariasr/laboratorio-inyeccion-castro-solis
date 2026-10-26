from django.db import transaction
from django.utils import timezone

from apps.inventory.exceptions import StockTransferError
from apps.inventory.models import (
    MovementDirection,
    StockMovement,
    StockMovementType,
    StockTransfer,
    StockTransferStatus,
)
from apps.inventory.selectors import current_stock


@transaction.atomic
def confirm_stock_transfer(*, stock_transfer: StockTransfer, user):
    """
    Punto 6 del plan del 2026-10-22: confirma el traslado y saca la
    mercadería del inventario (un TRANSFER_OUT por línea). Si alguna
    línea no tiene existencia suficiente no se mueve nada, y el mensaje
    las nombra todas.
    """

    stock_transfer = StockTransfer.objects.select_for_update().get(
        pk=stock_transfer.pk,
    )

    if stock_transfer.status != StockTransferStatus.DRAFT:
        raise StockTransferError(
            "Solo se puede confirmar un traslado en borrador."
        )

    if not stock_transfer.branch.is_active:
        raise StockTransferError(
            "La sede de destino está inactiva; elija otra antes de confirmar."
        )

    items = list(
        stock_transfer.items.select_related("product").order_by("id")
    )

    if not items:
        raise StockTransferError(
            "El traslado no tiene productos."
        )

    shortages = []

    for item in items:
        available = current_stock(item.product)

        if item.quantity > available:
            shortages.append(
                f"{item.product.standard_code} — {item.product.name} "
                f"(hay {available}, se trasladan {item.quantity})"
            )

    if shortages:
        raise StockTransferError(
            "No hay inventario suficiente: " + "; ".join(shortages) + "."
        )

    stock_transfer.status = StockTransferStatus.CONFIRMED
    stock_transfer.confirmed_at = timezone.now()
    stock_transfer.confirmed_by = user
    stock_transfer.updated_by = user

    stock_transfer.save(
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
            movement_type=StockMovementType.TRANSFER_OUT,
            direction=MovementDirection.OUT,
            quantity=item.quantity,
            notes=f"Traslado #{stock_transfer.id} a {stock_transfer.branch.name}",
            created_by=user,
            updated_by=user,
            stock_transfer_item=item,
        )

    return stock_transfer


@transaction.atomic
def cancel_stock_transfer(*, stock_transfer: StockTransfer, user, reason: str):
    """
    Anula el traslado. Un borrador solo cambia de estado. Uno confirmado
    devuelve la mercadería: revierte la salida de cada línea, y por eso
    pide el motivo (como anular una venta).
    """

    stock_transfer = StockTransfer.objects.select_for_update().get(
        pk=stock_transfer.pk,
    )

    if stock_transfer.status == StockTransferStatus.CANCELLED:
        raise StockTransferError("El traslado ya está anulado.")

    normalized_reason = reason.strip()

    if stock_transfer.status == StockTransferStatus.CONFIRMED:
        if not normalized_reason:
            raise StockTransferError(
                "El motivo es obligatorio para anular un traslado confirmado."
            )

        items = list(
            stock_transfer.items.select_related("product").order_by("id")
        )

        for item in items:
            original_movement = item.stock_movements.get(
                movement_type=StockMovementType.TRANSFER_OUT,
                direction=MovementDirection.OUT,
                reversal_movement__isnull=True,
            )

            StockMovement.create_from_service(
                product=item.product,
                movement_type=StockMovementType.REVERSAL,
                direction=MovementDirection.IN,
                quantity=original_movement.quantity,
                notes=(
                    f"Anulación de traslado #{stock_transfer.id}: "
                    f"{normalized_reason}"
                ),
                created_by=user,
                updated_by=user,
                stock_transfer_item=item,
                reverses_movement=original_movement,
            )

    stock_transfer.status = StockTransferStatus.CANCELLED
    stock_transfer.cancelled_at = timezone.now()
    stock_transfer.cancelled_by = user
    stock_transfer.cancellation_reason = normalized_reason
    stock_transfer.updated_by = user

    stock_transfer.save(
        update_fields=[
            "status",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
            "updated_by",
            "updated_at",
        ]
    )

    return stock_transfer
