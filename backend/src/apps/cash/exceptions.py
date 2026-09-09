class CashError(Exception):
    """Excepción base del dominio de caja."""


class InvalidWeekStartError(CashError):
    """La fecha de inicio de semana indicada no es un sábado."""


class CashClosingAlreadyExistsError(CashError):
    """Ya existe un cierre de caja para esta semana."""


class DifferenceReasonRequiredError(CashError):
    """Debe indicarse el motivo cuando hay diferencia entre lo esperado y lo contado."""
