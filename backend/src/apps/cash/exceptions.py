class CashError(Exception):
    """Excepción base del dominio de caja."""


class InvalidWeekStartError(CashError):
    """La fecha de inicio de semana indicada no es un sábado."""


class CashClosingAlreadyExistsError(CashError):
    """Ya existe un cierre de caja para esta semana."""


class FutureWeekClosingError(CashError):
    """La semana todavía no termina: su viernes de cierre no ha llegado."""


class DifferenceReasonRequiredError(CashError):
    """Debe indicarse el motivo cuando hay diferencia entre lo esperado y lo contado."""


class PettyCashWeekClosedError(CashError):
    """La semana de la salida de caja chica ya está cerrada."""


class FuturePettyCashOutflowError(CashError):
    """No se registran salidas de caja chica con fecha futura."""
