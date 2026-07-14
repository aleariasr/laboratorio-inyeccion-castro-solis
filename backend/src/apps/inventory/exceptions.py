class InventoryError(Exception):
    """Excepción base del dominio de inventario."""


class PurchaseAlreadyConfirmedError(InventoryError):
    """La compra ya fue confirmada."""


class PurchaseCancelledError(InventoryError):
    """La compra fue anulada."""


class PurchaseWithoutItemsError(InventoryError):
    """La compra no posee líneas."""


class InvalidPurchaseStatusError(InventoryError):
    """La compra no puede cambiar de estado."""

class InsufficientStockForPurchaseReversalError(InventoryError):
    """No existe inventario suficiente para revertir una compra."""