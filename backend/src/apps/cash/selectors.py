from datetime import timedelta

from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.core.models import PaymentMethod
from apps.customers.models import InjectorServiceRecord, InjectorServiceStatus
from apps.sales.models import SaleItem, SaleStatus

from .models import CashClosing

MONEY_FIELD = DecimalField(max_digits=14, decimal_places=4)

FRIDAY = 4  # Python: Monday=0 ... Friday=4, Saturday=5


def sales_total_by_method(week_start, week_end, payment_method):
    return (
        SaleItem.objects.filter(
            sale__status=SaleStatus.CONFIRMED,
            sale__payment_method=payment_method,
            sale__is_active=True,
            sale__sale_date__gte=week_start,
            sale__sale_date__lte=week_end,
        )
        .aggregate(
            total=Coalesce(
                Sum(
                    ExpressionWrapper(
                        F("quantity") * F("unit_price"),
                        output_field=MONEY_FIELD,
                    )
                ),
                0,
                output_field=MONEY_FIELD,
            )
        )["total"]
    )


def services_total_by_method(week_start, week_end, payment_method):
    return (
        InjectorServiceRecord.objects.filter(
            status=InjectorServiceStatus.DELIVERED,
            payment_method=payment_method,
            is_active=True,
            delivered_at__date__gte=week_start,
            delivered_at__date__lte=week_end,
        )
        .aggregate(
            total=Coalesce(
                Sum("price"),
                0,
                output_field=MONEY_FIELD,
            )
        )["total"]
    )


def expected_totals_by_method(week_start, week_end):
    """
    Total esperado (ventas + servicios) por cada método de pago,
    congelado más tarde en CashClosing.expected_cash/expected_card/
    expected_transfer/expected_other. El negocio concilia efectivo +
    vouchers de tarjeta + comprobantes de transferencia contra esto,
    no solo efectivo.
    """
    return {
        method: (
            sales_total_by_method(week_start, week_end, method)
            + services_total_by_method(week_start, week_end, method)
        )
        for method in PaymentMethod.values
    }


def expected_total(week_start, week_end):
    return sum(
        expected_totals_by_method(week_start, week_end).values(),
    )


def cash_closings():
    return CashClosing.objects.all().order_by("-week_start")


def pending_closing_week_start(today=None):
    """
    Fecha de inicio (sábado) de la última semana ya terminada que
    todavía no tiene un CashClosing, o None si esa semana ya está
    cerrada. Usada por el dashboard para avisar "falta cerrar caja".
    """
    today = today or timezone.localdate()

    days_since_friday = (today.weekday() - FRIDAY) % 7
    last_friday = today - timedelta(days=days_since_friday)
    week_start = last_friday - timedelta(days=6)

    if CashClosing.objects.filter(week_start=week_start).exists():
        return None

    return week_start
