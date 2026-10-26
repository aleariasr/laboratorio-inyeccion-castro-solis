from django.db.models import F
from django.db.models.functions import Collate

from apps.inventory.models import Product

# Colación ICU de la migración inventory/0027: español, con los números
# comparados como números ("A2" antes que "A10").
NATURAL_COLLATION = "lics_natural"

# Punto 2 del plan del 2026-10-22: los órdenes que acepta la lista de
# productos (`?ordering=campo` o `?ordering=-campo` para descendente).
# Los textos se comparan con la colación natural; `current_stock` es la
# anotación de current_stock_bulk.
PRODUCT_ORDERINGS = {
    "standard_code": lambda: Collate(F("standard_code"), NATURAL_COLLATION),
    "name": lambda: Collate(F("name"), NATURAL_COLLATION),
    "description": lambda: Collate(F("description"), NATURAL_COLLATION),
    "location": lambda: Collate(F("storage_location__code"), NATURAL_COLLATION),
    "current_stock": lambda: F("current_stock"),
    "created_at": lambda: F("created_at"),
    "updated_at": lambda: F("updated_at"),
}


def product_ordering_expressions(ordering):
    """
    Expresiones de order_by para un valor de PRODUCT_ORDERINGS (con "-"
    delante para descendente). Desempata siempre por código y por id, así
    las páginas no repiten ni saltan productos (las variantes comparten
    código). None si el valor no está en la lista.
    """

    descending = ordering.startswith("-")
    field = ordering[1:] if descending else ordering

    build_expression = PRODUCT_ORDERINGS.get(field)

    if build_expression is None:
        return None

    expression = build_expression()

    return [
        expression.desc() if descending else expression.asc(),
        PRODUCT_ORDERINGS["standard_code"]().asc(),
        F("id").asc(),
    ]


def variant_family(product):
    """
    Otras filas Product que comparten standard_code con `product`
    (variantes original/genérico/otro de la misma pieza) — ver §3.6.
    No incluye a `product` mismo.
    """
    return (
        Product.objects
        .filter(standard_code=product.standard_code)
        .exclude(pk=product.pk)
        .order_by("variant_kind", "name")
    )
