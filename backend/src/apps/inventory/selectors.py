from django.db.models import Sum

from .models import Product, StockMovement, StockMovementType


def get_current_stock(product: Product) -> int:
    """
    Calcula el inventario actual a partir de los movimientos.
    """

    entries = (
        StockMovement.objects.filter(
            product=product,
            movement_type__in=[
                StockMovementType.ENTRY,
                StockMovementType.INITIAL,
                StockMovementType.ADJUSTMENT,
            ],
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    exits = (
        StockMovement.objects.filter(
            product=product,
            movement_type=StockMovementType.EXIT,
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    return entries - exits