from django.db import models


class PurchaseStatus(models.TextChoices):
    DRAFT = "DRAFT", "Borrador"
    CONFIRMED = "CONFIRMED", "Confirmada"
    CANCELLED = "CANCELLED", "Anulada"


class Currency(models.TextChoices):
    CRC = "CRC", "Colones"
    USD = "USD", "Dólares"


class StockMovementType(models.TextChoices):
    ENTRY = "ENTRY", "Entrada"
    EXIT = "EXIT", "Salida"
    ADJUSTMENT = "ADJUSTMENT", "Ajuste"
    INITIAL = "INITIAL", "Inventario inicial"
    REVERSAL = "REVERSAL", "Reversión"
    SERVICE_USE = "SERVICE_USE", "Uso en servicio"
    # Punto 6 del plan del 2026-10-22: salida hacia otra sede.
    TRANSFER_OUT = "TRANSFER_OUT", "Traslado a sede"