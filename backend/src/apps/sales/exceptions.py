class SalesError(Exception):
    """Excepción base del dominio de ventas."""


class SaleAlreadyConfirmedError(SalesError):
    pass


class SaleCancelledError(SalesError):
    pass


class SaleWithoutItemsError(SalesError):
    pass


class InsufficientStockError(SalesError):
    pass

class SaleNotConfirmedError(SalesError):
    pass


class SaleAlreadyCancelledError(SalesError):
    pass