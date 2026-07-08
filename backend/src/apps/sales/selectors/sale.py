from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import Coalesce

from apps.sales.models import Sale, SaleItem, SaleStatus


def sale_total(sale: Sale):
    return (
        sale.items.aggregate(
            total=Coalesce(
                Sum(
                    ExpressionWrapper(
                        F("quantity") * F("unit_price"),
                        output_field=DecimalField(
                            max_digits=14,
                            decimal_places=4,
                        ),
                    )
                ),
                0,
                output_field=DecimalField(
                    max_digits=14,
                    decimal_places=4,
                ),
            )
        )["total"]
    )


def confirmed_sales():
    return Sale.objects.filter(
        status=SaleStatus.CONFIRMED,
        is_active=True,
    ).order_by("-sale_date", "-id")


def sale_items_for_product(product):
    return (
        SaleItem.objects.filter(
            product=product,
            sale__status=SaleStatus.CONFIRMED,
            sale__is_active=True,
        )
        .select_related("sale", "product")
        .order_by("-sale__sale_date", "-id")
    )