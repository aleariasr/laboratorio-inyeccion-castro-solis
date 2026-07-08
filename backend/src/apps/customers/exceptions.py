class CustomerError(Exception):
    """Base exception del dominio Customers."""


class CustomerAlreadyExistsError(CustomerError):
    """Ya existe un cliente con esa identificación."""


class CustomerInactiveError(CustomerError):
    """El cliente se encuentra inactivo."""


class InjectorAlreadyExistsError(CustomerError):
    """El inyector ya existe para ese cliente."""