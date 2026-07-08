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