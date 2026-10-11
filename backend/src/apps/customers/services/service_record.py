from django.db import transaction

from apps.core.money import DocumentAmountsError
from apps.customers.exceptions import (
    InvalidServiceTransitionError,
    ServiceAmountsError,
    ServiceMissingPriceError,
)
from apps.customers.models import (
    InjectorServiceRecord,
    InjectorServiceStatus,
)
from apps.customers.selectors import live_service_amounts
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
    tax_percentage=0,
):
    # La vista (la pantalla) pasa DEFAULT_TAX_PERCENTAGE; el código que
    # crea servicios por otra vía queda en 0, igual que las ventas.
    return InjectorServiceRecord.objects.create(
        injector=injector,
        received_at=received_at,
        tax_percentage=tax_percentage,
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

    # Antes de cambiar el estado: si el descuento no cuadra, el servicio
    # sigue listo y no se entrega (punto 26).
    try:
        amounts = live_service_amounts(service_record)
    except DocumentAmountsError as exc:
        raise ServiceAmountsError(str(exc)) from exc

    service_record = _change_status(
        service_record=service_record,
        expected_status=InjectorServiceStatus.READY,
        new_status=InjectorServiceStatus.DELIVERED,
        user=user,
    )

    service_record.delivered_at = delivered_at
    # Montos congelados: lo que se cobró. La caja y la factura los usan.
    service_record.subtotal_amount = amounts.subtotal
    service_record.discount_amount = amounts.discount_amount
    service_record.tax_amount = amounts.tax_amount
    service_record.total_amount = amounts.total

    service_record.save(
        update_fields=[
            "delivered_at",
            "subtotal_amount",
            "discount_amount",
            "tax_amount",
            "total_amount",
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