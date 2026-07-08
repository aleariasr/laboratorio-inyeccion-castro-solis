class InventoryError(Exception):
    """Excepción base del módulo de inventario."""


class PurchaseAlreadyConfirmedError(InventoryError):
    """La compra ya fue confirmada."""


class PurchaseWithoutItemsError(InventoryError):
    """La compra no tiene líneas."""


class InvalidPurchaseStateError(InventoryError):
    """La compra no puede confirmarse en su estado actual."""


class InsufficientStockError(InventoryError):
    """No existe inventario suficiente."""