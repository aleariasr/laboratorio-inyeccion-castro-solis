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
from apps.customers.services.locking import lock_service_record
from apps.customers.services.service_accessory import (
    reverse_accessory_stock_movement,
)
from apps.inventory.selectors import lock_products


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
    service_type=None,
    notes_before="",
):
    # La vista (la pantalla) pasa DEFAULT_TAX_PERCENTAGE; el código que
    # crea servicios por otra vía queda en 0, igual que las ventas.
    return InjectorServiceRecord.objects.create(
        injector=injector,
        received_at=received_at,
        tax_percentage=tax_percentage,
        service_type=service_type,
        notes_before=notes_before,
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def receive_injectors(
    *,
    items,
    received_at,
    user,
    tax_percentage=0,
    service_type=None,
):
    """
    Recepción de varios inyectores del mismo cliente a la vez (punto 1C
    del plan del 2026-10-22). Sigue siendo un servicio por inyector, con
    la misma fecha y tipo; `items` es [(inyector, notas antes)]. En una
    transacción: si uno falla no queda ninguno a medias.
    """

    return [
        receive_injector(
            injector=injector,
            received_at=received_at,
            user=user,
            tax_percentage=tax_percentage,
            service_type=service_type,
            notes_before=notes_before,
        )
        for injector, notes_before in items
    ]


@transaction.atomic
def start_service(
    *,
    service_record,
    user,
):
    return _change_status(
        service_record=lock_service_record(service_record.pk),
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
        service_record=lock_service_record(service_record.pk),
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
    # Recién leído y bloqueado: entrega lo que el servicio tiene ahora,
    # aunque otra pantalla le acabe de agregar un accesorio.
    service_record = lock_service_record(service_record.pk)

    if service_record.price is None:
        raise ServiceMissingPriceError(
            "El servicio no tiene nada que cobrar todavía: para entregarlo "
            "hace falta una línea de cobro o un accesorio (así se cuenta "
            "correctamente en el cierre de caja)."
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
    service_record = lock_service_record(service_record.pk)

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
    accessories = list(
        service_record.accessories.select_related(
            "product",
        ).prefetch_related("stock_movements")
    )

    lock_products(accessory.product_id for accessory in accessories)

    for service_accessory in accessories:
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