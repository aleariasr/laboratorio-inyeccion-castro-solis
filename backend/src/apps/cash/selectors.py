from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import Coalesce

from apps.core.models import PaymentMethod
from apps.customers.models import InjectorServiceRecord, InjectorServiceStatus
from apps.sales.models import SaleItem, SaleStatus

from .models import CashClosing

MONEY_FIELD = DecimalField(max_digits=14, decimal_places=4)


def cash_sales_total(week_start, week_end):
    return (
        SaleItem.objects.filter(
            sale__status=SaleStatus.CONFIRMED,
            sale__payment_method=PaymentMethod.CASH,
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


def cash_services_total(week_start, week_end):
    return (
        InjectorServiceRecord.objects.filter(
            status=InjectorServiceStatus.DELIVERED,
            payment_method=PaymentMethod.CASH,
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


def expected_cash_total(week_start, week_end):
    return cash_sales_total(week_start, week_end) + cash_services_total(
        week_start, week_end,
    )


def cash_closings():
    return CashClosing.objects.all().order_by("-week_start")
