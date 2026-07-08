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