from apps.inventory.models import Product


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
