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