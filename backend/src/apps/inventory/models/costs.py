from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel

from .catalog import Currency
from .purchase import Purchase


class ImportCostCategory(AuditModel, ActivableModel):
    """
    Catálogo de tipos de costos adicionales de importación.
    """

    name = models.CharField(
        max_length=100,
        unique=True,
    )

    description = models.CharField(
        max_length=255,
        blank=True,
    )

    class Meta:
        db_table = "inventory_import_cost_categories"
        verbose_name = "Categoría de costo"
        verbose_name_plural = "Categorías de costo"
        ordering = ["name"]

    def __str__(self):
        return self.name


class ImportCost(AuditModel, ActivableModel):
    """
    Costo adicional asociado a una compra.
    """

    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.CASCADE,
        related_name="import_costs",
    )

    category = models.ForeignKey(
        ImportCostCategory,
        on_delete=models.PROTECT,
        related_name="import_costs",
    )

    description = models.CharField(
        max_length=255,
        blank=True,
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[
            MinValueValidator(Decimal("0.0001")),
        ]
    )

    currency = models.CharField(
        max_length=3,
        choices=Currency.choices,
    )

    class Meta:
        db_table = "inventory_import_costs"
        verbose_name = "Costo adicional"
        verbose_name_plural = "Costos adicionales"
        ordering = [
            "purchase",
            "category",
        ]

    def __str__(self):
        return (
            f"{self.purchase.invoice_number} - "
            f"{self.category.name}"
        )