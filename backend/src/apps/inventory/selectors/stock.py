from django.db.models import Case, F, IntegerField, Sum, Value, When
from django.db.models.functions import Coalesce

from apps.inventory.models import (
    MovementDirection,
    Product,
    StockMovement,
)


def current_stock(product: Product) -> int:
    result = (
        product.stock_movements.annotate(
            signed_quantity=Case(
                When(direction=MovementDirection.IN, then=F("quantity")),
                When(direction=MovementDirection.OUT, then=-F("quantity")),
                default=Value(0),
                output_field=IntegerField(),
            )
        )
        .aggregate(stock=Coalesce(Sum("signed_quantity"), Value(0)))
    )

    return result["stock"]


def stock_history(product: Product):
    return StockMovement.objects.filter(product=product).order_by(
        "-created_at",
        "-id",
    )


def current_stock_bulk():
    return (
        Product.objects.annotate(
            current_stock=Coalesce(
                Sum(
                    Case(
                        When(
                            stock_movements__direction=MovementDirection.IN,
                            then=F("stock_movements__quantity"),
                        ),
                        When(
                            stock_movements__direction=MovementDirection.OUT,
                            then=-F("stock_movements__quantity"),
                        ),
                        default=Value(0),
                        output_field=IntegerField(),
                    )
                ),
                Value(0),
            )
        )
        .order_by("standard_code")
    )


def low_stock_products():
    return current_stock_bulk().filter(
        current_stock__lte=F("minimum_stock"),
        is_active=True,
    )