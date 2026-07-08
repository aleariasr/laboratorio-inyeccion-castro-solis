from django.db.models import Q

from apps.customers.models import Customer


def customer_by_identification(identification: str):
    identification = identification.strip().upper()

    return Customer.objects.filter(
        identification=identification,
        is_active=True,
    ).first()


def customer_search(query: str):
    query = query.strip()

    return Customer.objects.filter(
        is_active=True,
    ).filter(
        Q(display_name__icontains=query)
        | Q(identification__icontains=query)
        | Q(phone__icontains=query)
        | Q(email__icontains=query)
    ).order_by("display_name")