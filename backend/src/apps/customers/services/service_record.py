from django.db import transaction

from apps.customers.models import (
    InjectorServiceRecord,
)

def _change_status(
    *,
    service_record,
    expected_status,
    new_status,
    user,
):
    from apps.customers.exceptions import (
        InvalidServiceTransitionError,
    )

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

from apps.customers.models import InjectorServiceStatus


from apps.customers.models import InjectorServiceStatus


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
    from apps.customers.models import InjectorServiceStatus

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
    from apps.customers.models import InjectorServiceStatus

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
    from apps.customers.models import InjectorServiceStatus

    if service_record.status == InjectorServiceStatus.DELIVERED:
        from apps.customers.exceptions import (
            InvalidServiceTransitionError,
        )

        raise InvalidServiceTransitionError(
            "Un servicio entregado no puede anularse."
        )

    if service_record.status == InjectorServiceStatus.CANCELLED:
        from apps.customers.exceptions import (
            InvalidServiceTransitionError,
        )

        raise InvalidServiceTransitionError(
            "El servicio ya está anulado."
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