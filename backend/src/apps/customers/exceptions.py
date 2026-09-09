class CustomerError(Exception):
    """Excepción base del dominio de clientes."""


class CustomerAlreadyExistsError(CustomerError):
    """El cliente ya existe."""


class CustomerInactiveError(CustomerError):
    """El cliente está inactivo."""


class InjectorAlreadyExistsError(CustomerError):
    """El inyector ya existe para el cliente."""


class InvalidServiceTransitionError(CustomerError):
    """La transición de estado del servicio no es válida."""


class ServiceNotEditableError(CustomerError):
    """El servicio ya no admite cambios (entregado o anulado)."""


class InsufficientStockForServiceError(CustomerError):
    """No hay inventario suficiente para usar este producto como accesorio."""


class ServiceMissingPriceError(CustomerError):
    """El servicio no tiene precio definido, no se puede entregar así."""