class SalesError(Exception):
    """Excepción base del dominio de ventas."""


class SaleAlreadyConfirmedError(SalesError):
    """La venta ya fue confirmada."""


class SaleCancelledError(SalesError):
    """La venta fue anulada."""


class SaleWithoutItemsError(SalesError):
    """La venta no posee líneas."""


class InsufficientStockError(SalesError):
    """No hay inventario suficiente."""


class SaleNotConfirmedError(SalesError):
    """La venta no está confirmada."""


class SaleAlreadyCancelledError(SalesError):
    """La venta ya fue anulada."""