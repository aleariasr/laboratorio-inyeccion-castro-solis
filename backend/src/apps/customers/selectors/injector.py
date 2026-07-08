from apps.customers.models import Injector


def injector_history(injector: Injector):
    return (
        injector.service_records
        .select_related("injector")
        .order_by("-received_at", "-id")
    )