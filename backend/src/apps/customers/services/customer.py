from django.db import transaction

from apps.customers.exceptions import (
    CustomerAlreadyExistsError,
)
from apps.customers.models import Customer


@transaction.atomic
def register_customer(
    *,
    customer_type,
    display_name,
    identification,
    phone,
    email,
    notes,
    user,
):
    identification = identification.strip().upper()

    if (
        identification
        and Customer.objects.filter(
            identification=identification
        ).exists()
    ):
        raise CustomerAlreadyExistsError(
            "Ya existe un cliente con esa identificación."
        )

    return Customer.objects.create(
        customer_type=customer_type,
        display_name=display_name,
        identification=identification,
        phone=phone,
        email=email,
        notes=notes,
        created_by=user,
        updated_by=user,
    )

from apps.customers.exceptions import InjectorAlreadyExistsError
from apps.customers.models import Injector


@transaction.atomic
def register_injector(
    *,
    customer,
    injector_number,
    description,
    notes,
    user,
):
    injector_number = injector_number.strip().upper()

    if Injector.objects.filter(
        customer=customer,
        injector_number=injector_number,
    ).exists():
        raise InjectorAlreadyExistsError(
            "El inyector ya existe para este cliente."
        )

    return Injector.objects.create(
        customer=customer,
        injector_number=injector_number,
        description=description,
        notes=notes,
        created_by=user,
        updated_by=user,
    )