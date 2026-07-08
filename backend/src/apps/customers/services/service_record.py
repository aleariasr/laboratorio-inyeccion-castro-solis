from django.db import transaction

from apps.customers.models import (
    InjectorServiceRecord,
)


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


@transaction.atomic
def start_service(
    *,
    service_record,
    user,
):
    if service_record.status != InjectorServiceStatus.RECEIVED:
        raise ValueError(
            "Solo un servicio recibido puede iniciarse."
        )

    service_record.status = InjectorServiceStatus.IN_PROGRESS
    service_record.updated_by = user

    service_record.save(
        update_fields=[
            "status",
            "updated_by",
            "updated_at",
        ]
    )

    return service_record