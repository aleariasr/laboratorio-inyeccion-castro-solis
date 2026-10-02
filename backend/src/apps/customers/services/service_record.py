from django.db import transaction

from apps.customers.exceptions import (
    InvalidServiceTransitionError,
    ServiceMissingPriceError,
)
from apps.customers.models import (
    InjectorServiceRecord,
    InjectorServiceStatus,
)
from apps.customers.services.service_accessory import (
    reverse_accessory_stock_movement,
)


def _change_status(
    *,
    service_record,
    expected_status,
    new_status,
    user,
):
    if service_record.status != expected_status:
        raise InvalidServiceTransitionError(
            f"No se puede cambiar de "
            f"{service_record.status} "
            f"a {new_status}."
        )

    service_record.status = new_status
    service_record.updated_by = user

    service_record.save(
        update_fields=[
            "status",
            "updated_by",
            "updated_at",
        ]
    )

    return service_record


@transaction.atomic
def receive_injector(
    *,
    injector,
    received_at,
    user,
):
    return InjectorServiceRecord.objects.create(
        injector=injector,
        received_at=received_at,
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def start_service(
    *,
    service_record,
    user,
):
    return _change_status(
        service_record=service_record,
        expected_status=InjectorServiceStatus.RECEIVED,
        new_status=InjectorServiceStatus.IN_PROGRESS,
        user=user,
    )


@transaction.atomic
def mark_ready(
    *,
    service_record,
    user,
):
    return _change_status(
        service_record=service_record,
        expected_status=InjectorServiceStatus.IN_PROGRESS,
        new_status=InjectorServiceStatus.READY,
        user=user,
    )


@transaction.atomic
def deliver_service(
    *,
    service_record,
    delivered_at,
    user,
):
    if service_record.price is None:
        raise ServiceMissingPriceError(
            "Debe definir el precio del servicio antes de entregarlo "
            "(así se cuenta correctamente en el cierre de caja)."
        )

    service_record = _change_status(
        service_record=service_record,
        expected_status=InjectorServiceStatus.READY,
        new_status=InjectorServiceStatus.DELIVERED,
        user=user,
    )

    service_record.delivered_at = delivered_at

    service_record.save(
        update_fields=[
            "delivered_at",
            "updated_at",
        ]
    )

    return service_record


@transaction.atomic
def cancel_service(
    *,
    service_record,
    user,
):
    if service_record.status == InjectorServiceStatus.DELIVERED:
        raise InvalidServiceTransitionError(
            "Un servicio entregado no puede anularse."
        )

    if service_record.status == InjectorServiceStatus.CANCELLED:
        raise InvalidServiceTransitionError(
            "El servicio ya está anulado."
        )

    # Los accesorios ya usados vuelven al inventario, igual que las
    # líneas de una venta anulada (ver cancel_sale). No se borran: son el
    # registro histórico de lo que se le había puesto al inyector. Una vez
    # anulado el servicio ya no se pueden quitar uno por uno
    # (_LOCKED_STATUSES en service_accessory.py), así que esta es la única
    # oportunidad de devolver el stock.
    for service_accessory in service_record.accessories.select_related(
        "product",
    ).prefetch_related("stock_movements"):
        reverse_accessory_stock_movement(
            service_accessory=service_accessory,
            notes=f"Anulación de servicio #{service_record.id}",
            user=user,
        )

    service_record.status = InjectorServiceStatus.CANCELLED
    service_record.updated_by = user

    service_record.save(
        update_fields=[
            "status",
            "updated_by",
            "updated_at",
        ]
    )

    return service_record