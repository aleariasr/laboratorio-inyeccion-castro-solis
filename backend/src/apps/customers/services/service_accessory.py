from django.db import transaction

from apps.customers.exceptions import (
    InsufficientStockForServiceError,
    ServiceNotEditableError,
)
from apps.customers.models import (
    InjectorServiceAccessory,
    InjectorServiceStatus,
)
from apps.inventory.models import (
    MovementDirection,
    StockMovement,
    StockMovementType,
)
from apps.inventory.selectors import current_stock

_LOCKED_STATUSES = {
    InjectorServiceStatus.DELIVERED,
    InjectorServiceStatus.CANCELLED,
}


def _ensure_service_is_editable(service_record):
    if service_record.status in _LOCKED_STATUSES:
        raise ServiceNotEditableError(
            "No se pueden modificar accesorios de servicios entregados o anulados."
        )


@transaction.atomic
def add_service_accessory(
    *,
    service_record,
    product,
    quantity,
    notes,
    user,
):
    _ensure_service_is_editable(service_record)

    available = current_stock(product)

    if quantity > available:
        raise InsufficientStockForServiceError(
            f"No hay inventario suficiente de {product.standard_code} "
            f"(disponible: {available})."
        )

    service_accessory = InjectorServiceAccessory.objects.create(
        service_record=service_record,
        product=product,
        quantity=quantity,
        notes=notes,
        created_by=user,
        updated_by=user,
    )

    StockMovement.create_from_service(
        product=product,
        movement_type=StockMovementType.SERVICE_USE,
        direction=MovementDirection.OUT,
        quantity=quantity,
        notes=f"Accesorio usado en servicio #{service_record.id}",
        created_by=user,
        updated_by=user,
        service_accessory=service_accessory,
    )

    return service_accessory


def reverse_accessory_stock_movement(
    *,
    service_accessory: InjectorServiceAccessory,
    notes,
    user,
):
    """
    Devuelve al inventario el accesorio usado en un servicio: busca su
    movimiento SERVICE_USE/OUT original y crea la reversión.

    La comparte remove_service_accessory (al quitar el accesorio) con
    cancel_service (al anular el servicio completo). reverses_movement es
    OneToOne, así que un movimiento solo se puede revertir una vez.
    """

    original_movement = service_accessory.stock_movements.get(
        movement_type=StockMovementType.SERVICE_USE,
        direction=MovementDirection.OUT,
        reverses_movement__isnull=True,
    )

    return StockMovement.create_from_service(
        product=service_accessory.product,
        movement_type=StockMovementType.REVERSAL,
        direction=MovementDirection.IN,
        quantity=original_movement.quantity,
        notes=notes,
        created_by=user,
        updated_by=user,
        service_accessory=service_accessory,
        reverses_movement=original_movement,
    )


@transaction.atomic
def remove_service_accessory(
    *,
    service_accessory: InjectorServiceAccessory,
    user,
):
    service_record = service_accessory.service_record

    _ensure_service_is_editable(service_record)

    reverse_accessory_stock_movement(
        service_accessory=service_accessory,
        notes=f"Eliminación de accesorio de servicio #{service_record.id}",
        user=user,
    )

    service_accessory.delete()
