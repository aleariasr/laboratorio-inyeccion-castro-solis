from .exceptions import PurchaseWithoutItemsError


def validate_purchase_has_items(purchase):
    """
    Verifica que la compra tenga al menos una línea.
    """

    if not purchase.items.exists():
        raise PurchaseWithoutItemsError(
            "La compra no contiene líneas."
        )