from django.db import transaction

from apps.customers.exceptions import (
    InsufficientStockForServiceError,
    ServiceNotEditableError,
)
from apps.customers.models import (
    InjectorServiceAccessory,
    InjectorServiceStatus,
)
from apps.customers.services.locking import lock_service_record
from apps.customers.services.service_charges import recalculate_service_price
from apps.inventory.models import (
    MovementDirection,
    StockMovement,
    StockMovementType,
)
from apps.inventory.selectors import (
    current_stock,
    effective_sale_price,
    lock_products,
)

_LOCKED_STATUSES = {
    InjectorServiceStatus.DELIVERED,
    InjectorServiceStatus.CANCELLED,
}


def _ensure_service_is_editable(service_record):
    if service_record.status in _LOCKED_STATUSES:
        raise ServiceNotEditableError(
            "No se pueden modificar accesorios de servicios entregados o anulados."
        )


def _lock_accessory(service_accessory):
    """
    Bloquea el servicio del accesorio y relee el accesorio: si mientras
    tanto otra pantalla lo quitó, no hay nada que cambiar.
    """

    service_record = lock_service_record(service_accessory.service_record_id)

    fresh = (
        InjectorServiceAccessory.objects.select_related("product")
        .filter(pk=service_accessory.pk)
        .first()
    )

    if fresh is None:
        raise ServiceNotEditableError(
            "El accesorio ya no está en el servicio."
        )

    fresh.service_record = service_record

    return fresh


def _ensure_stock(product, needed, available):
    if needed > available:
        raise InsufficientStockForServiceError(
            f"No hay inventario suficiente de {product.standard_code} — "
            f"{product.name}: se pueden usar hasta {available}."
        )


def _default_unit_price(product):
    """Precio de venta del producto al momento de agregarlo; 0 si no tiene."""

    price = effective_sale_price(product)

    return price if price is not None else 0


def _record_service_use(*, service_accessory, quantity, user):
    return StockMovement.create_from_service(
        product=service_accessory.product,
        movement_type=StockMovementType.SERVICE_USE,
        direction=MovementDirection.OUT,
        quantity=quantity,
        notes=f"Accesorio usado en servicio #{service_accessory.service_record_id}",
        created_by=user,
        updated_by=user,
        service_accessory=service_accessory,
    )


def _active_service_use(service_accessory):
    """
    La salida vigente del accesorio: la SERVICE_USE que todavía no tiene
    reversión. Un accesorio puede tener varias salidas en su historia (cada
    cambio de cantidad revierte la anterior y registra una nueva), pero
    siempre una sola vigente.
    """

    return service_accessory.stock_movements.get(
        movement_type=StockMovementType.SERVICE_USE,
        direction=MovementDirection.OUT,
        reversal_movement__isnull=True,
    )


@transaction.atomic
def add_service_accessory(
    *,
    service_record,
    product,
    quantity,
    notes,
    user,
    unit_price=None,
):
    service_record = lock_service_record(service_record.pk)

    _ensure_service_is_editable(service_record)

    lock_products([product.pk])

    _ensure_stock(product, quantity, current_stock(product))

    service_accessory = InjectorServiceAccessory.objects.create(
        service_record=service_record,
        product=product,
        quantity=quantity,
        notes=notes,
        unit_price=(
            unit_price if unit_price is not None else _default_unit_price(product)
        ),
        created_by=user,
        updated_by=user,
    )

    _record_service_use(
        service_accessory=service_accessory,
        quantity=quantity,
        user=user,
    )

    recalculate_service_price(service_record)

    return service_accessory


def reverse_accessory_stock_movement(
    *,
    service_accessory: InjectorServiceAccessory,
    notes,
    user,
):
    """
    Devuelve al inventario lo que el accesorio tiene usado: revierte su
    salida vigente (ver _active_service_use).

    La usan remove_service_accessory (al quitar el accesorio), cancel_service
    (al anular el servicio completo) y update_service_accessory (al cambiar
    la cantidad). reverses_movement es OneToOne, así que un movimiento solo
    se puede revertir una vez.
    """

    original_movement = _active_service_use(service_accessory)

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
def update_service_accessory(
    *,
    service_accessory: InjectorServiceAccessory,
    user,
    quantity=None,
    unit_price=None,
    notes=None,
):
    """
    Cambia cantidad, precio o notas de un accesorio ya usado.

    Cantidad: se revierte la salida vigente completa y se registra una
    salida nueva con la cantidad nueva. Así cada salida se revierte una
    sola vez y por su cantidad exacta (la regla de los movimientos), y el
    kardex muestra el cambio. Para subirla alcanza lo que hay en
    inventario más lo que el accesorio ya tenía.
    """

    service_accessory = _lock_accessory(service_accessory)
    service_record = service_accessory.service_record

    _ensure_service_is_editable(service_record)

    update_fields = ["updated_by", "updated_at"]

    if quantity is not None and quantity != service_accessory.quantity:
        product = service_accessory.product

        lock_products([product.pk])

        _ensure_stock(
            product,
            quantity,
            current_stock(product) + service_accessory.quantity,
        )

        reverse_accessory_stock_movement(
            service_accessory=service_accessory,
            notes=(
                f"Cambio de cantidad de accesorio en servicio #{service_record.id} "
                f"({service_accessory.quantity} → {quantity})"
            ),
            user=user,
        )

        _record_service_use(
            service_accessory=service_accessory,
            quantity=quantity,
            user=user,
        )

        service_accessory.quantity = quantity
        update_fields.append("quantity")

    if unit_price is not None and unit_price != service_accessory.unit_price:
        service_accessory.unit_price = unit_price
        update_fields.append("unit_price")

    if notes is not None and notes != service_accessory.notes:
        service_accessory.notes = notes
        update_fields.append("notes")

    service_accessory.updated_by = user
    service_accessory.save(update_fields=update_fields)

    recalculate_service_price(service_record)

    return service_accessory


@transaction.atomic
def remove_service_accessory(
    *,
    service_accessory: InjectorServiceAccessory,
    user,
):
    service_accessory = _lock_accessory(service_accessory)
    service_record = service_accessory.service_record

    _ensure_service_is_editable(service_record)

    lock_products([service_accessory.product_id])

    reverse_accessory_stock_movement(
        service_accessory=service_accessory,
        notes=f"Eliminación de accesorio de servicio #{service_record.id}",
        user=user,
    )

    service_accessory.delete()

    recalculate_service_price(service_record)
