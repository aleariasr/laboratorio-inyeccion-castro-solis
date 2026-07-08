from django.db.models import Case, F, IntegerField, Sum, Value, When
from django.db.models.functions import Coalesce

from apps.inventory.models import (
    MovementDirection,
    Product,
)


def current_stock(product: Product) -> int:
    result = (
        product.stock_movements.annotate(
            signed_quantity=Case(
                When(
                    direction=MovementDirection.IN,
                    then=F("quantity"),
                ),
                When(
                    direction=MovementDirection.OUT,
                    then=-F("quantity"),
                ),
                default=Value(0),
                output_field=IntegerField(),
            )
        )
        .aggregate(
            stock=Coalesce(
                Sum("signed_quantity"),
                Value(0),
            )
        )
    )

    return result["stock"]