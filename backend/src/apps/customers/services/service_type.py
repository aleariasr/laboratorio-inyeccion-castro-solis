from django.db import transaction

from apps.customers.models import ServiceTypePriceHistory


@transaction.atomic
def sync_service_type_price_history(*, service_record, user):
    """
    Registra (o actualiza) cuánto se cobró la última vez que se usó el
    tipo de servicio de este registro, para mostrarlo como referencia la
    próxima vez. No hace nada si el servicio no tiene tipo o precio.
    """
    if not service_record.service_type_id or service_record.price is None:
        return None

    history, created = ServiceTypePriceHistory.objects.get_or_create(
        service_type=service_record.service_type,
        service_record=service_record,
        defaults={
            "price": service_record.price,
            "created_by": user,
            "updated_by": user,
        },
    )

    if not created and history.price != service_record.price:
        history.price = service_record.price
        history.updated_by = user

        history.save(
            update_fields=[
                "price",
                "updated_by",
                "updated_at",
            ]
        )

    return history
