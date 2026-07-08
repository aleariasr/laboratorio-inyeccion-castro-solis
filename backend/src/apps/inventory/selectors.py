from django.db.models import Case, F, IntegerField, Sum, Value, When
from django.db.models.functions import Coalesce

from .models import Product, StockMovementType


def current_stock(product: Product) -> int:
    """
    Calcula el inventario actual de un producto a partir
    del historial de movimientos.
    """

    result = (
        product.stock_movements.annotate(
            signed_quantity=Case(
                When(
                    movement_type__in=[
                        StockMovementType.ENTRY,
                        StockMovementType.INITIAL,
                    ],
                    then=F("quantity"),
                ),
                When(
                    movement_type__in=[
                        StockMovementType.EXIT,
                    ],
                    then=-F("quantity"),
                ),
                When(
                    movement_type=StockMovementType.ADJUSTMENT,
                    then=F("quantity"),
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