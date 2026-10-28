from decimal import Decimal

from django.db import transaction

from apps.customers.exceptions import (
    ServiceNotEditableError,
    ServicePriceTooHighError,
)
from apps.customers.models import InjectorServiceStatus, ServiceChargeLine
from apps.customers.services.locking import lock_service_record

# El precio del servicio es DecimalField(max_digits=12, decimal_places=4).
MAX_SERVICE_PRICE = Decimal("99999999.9999")

_LOCKED_STATUSES = {
    InjectorServiceStatus.DELIVERED,
    InjectorServiceStatus.CANCELLED,
}


def _ensure_service_is_editable(service_record):
    if service_record.status in _LOCKED_STATUSES:
        raise ServiceNotEditableError(
            "No se puede modificar el cobro de servicios entregados o anulados."
        )


def _lock_line(line):
    """
    Bloquea el servicio de la línea y relee la línea: si mientras tanto
    otra pantalla la quitó, no hay nada que cambiar.
    """

    service_record = lock_service_record(line.service_record_id)

    fresh = ServiceChargeLine.objects.filter(pk=line.pk).first()

    if fresh is None:
        raise ServiceNotEditableError("La línea ya no está en el servicio.")

    fresh.service_record = service_record

    return fresh


def recalculate_service_price(service_record):
    """
    El precio del servicio (subtotal) = líneas de cobro + accesorios, cada
    uno por su cantidad (punto 3 + 1B del plan del 2026-10-22). Sin líneas
    ni accesorios queda en None, y el servicio no se puede entregar.

    Antes el precio se escribía a mano y el sugerido sumaba los accesorios
    sobre un precio que ya los incluía, así que crecía cada vez. Ahora
    nadie lo escribe: se recalcula cada vez que cambia una línea o un
    accesorio. Caja, reportes y factura siguen leyendo price.
    """

    lines = list(service_record.charge_lines.all())
    accessories = list(service_record.accessories.all())

    if not lines and not accessories:
        price = None
    else:
        price = sum(
            (line.unit_price * line.quantity for line in lines),
            Decimal("0"),
        ) + sum(
            (accessory.unit_price * accessory.quantity for accessory in accessories),
            Decimal("0"),
        )

    # Antes de guardar: un total que no cabe daba error 500 (pasada previa
    # a la 2.5.0). Al cortar aquí, la transacción deshace también la línea
    # o el accesorio que lo provocó.
    if price is not None and price > MAX_SERVICE_PRICE:
        raise ServicePriceTooHighError(
            "El total del servicio superaría ₡99 999 999,99, el máximo que "
            "se puede registrar."
        )

    if price != service_record.price:
        service_record.price = price
        service_record.save(update_fields=["price", "updated_at"])

    return service_record


@transaction.atomic
def add_charge_line(
    *,
    service_record,
    description,
    quantity,
    unit_price,
    user,
    service_type=None,
):
    service_record = lock_service_record(service_record.pk)

    _ensure_service_is_editable(service_record)

    line = ServiceChargeLine.objects.create(
        service_record=service_record,
        service_type=service_type,
        description=description,
        quantity=quantity,
        unit_price=unit_price,
        created_by=user,
        updated_by=user,
    )

    # El tipo del servicio es el de su primera línea con tipo: lo usan el
    # listado y los filtros.
    if service_type is not None and service_record.service_type_id is None:
        service_record.service_type = service_type
        service_record.updated_by = user
        service_record.save(
            update_fields=["service_type", "updated_by", "updated_at"],
        )

    recalculate_service_price(service_record)

    return line


@transaction.atomic
def update_charge_line(*, line, user, **fields):
    line = _lock_line(line)

    _ensure_service_is_editable(line.service_record)

    for field_name, value in fields.items():
        setattr(line, field_name, value)

    line.updated_by = user
    line.save()

    recalculate_service_price(line.service_record)

    return line


@transaction.atomic
def remove_charge_line(*, line, user):
    line = _lock_line(line)
    service_record = line.service_record

    _ensure_service_is_editable(service_record)

    line.delete()

    recalculate_service_price(service_record)
