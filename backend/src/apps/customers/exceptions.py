class CustomerError(Exception):
    """Excepción base del dominio Customers."""


class CustomerAlreadyExistsError(CustomerError):
    pass


class CustomerInactiveError(CustomerError):
    pass


class InjectorAlreadyExistsError(CustomerError):
    pass


class InvalidServiceTransitionError(CustomerError):
    pass