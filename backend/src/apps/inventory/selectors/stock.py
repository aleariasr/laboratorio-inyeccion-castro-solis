from django.db.models import Case, F, IntegerField, Sum, Value, When
from django.db.models.functions import Coalesce

from apps.inventory.models import (
    MovementDirection,
    Product,
    StockMovement,
)


def lock_products(product_ids) -> None:
    """
    Bloquea las filas de los productos (SELECT … FOR UPDATE) hasta el fin
    de la transacción. Se llama antes de leer la existencia en todo lo que
    mueve inventario: así dos documentos que sacan el mismo producto a la
    vez no pasan los dos la verificación con la misma existencia (pasada
    previa a la 2.5.0: dos ventas por todo el stock, confirmadas a la vez,
    lo dejaban en negativo).

    Siempre en orden de id, para que dos transacciones que bloquean los
    mismos productos no se esperen en cruz. Debe llamarse dentro de
    transaction.atomic.
    """

    list(
        Product.objects.select_for_update()
        .filter(pk__in=set(product_ids))
        .order_by("pk")
        .values_list("pk", flat=True)
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