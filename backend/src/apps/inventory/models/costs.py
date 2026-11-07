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

    exchange_rate = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=1,
        validators=[
            MinValueValidator(Decimal("0.0001")),
        ],
        help_text=(
            "Colones por dólar con que se pagó el costo. "
            "1 si el costo es en colones."
        ),
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
    
class ProductCostHistory(AuditModel):
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.PROTECT,
        related_name="cost_history",
    )

    purchase = models.ForeignKey(
        "inventory.Purchase",
        on_delete=models.PROTECT,
        related_name="product_cost_history",
    )

    original_unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[
            MinValueValidator(Decimal("0.0001")),
        ],
    )

    cost_factor = models.DecimalField(
        max_digits=12,
        decimal_places=6,
        validators=[
            MinValueValidator(Decimal("0.000001")),
        ],
    )

    final_unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[
            MinValueValidator(Decimal("0.0001")),
        ],
        help_text="En colones, con los costos de importación prorrateados.",
    )

    # Moneda y tipo de cambio de la compra: original_unit_cost está en esa
    # moneda; final_unit_cost y suggested_price, siempre en colones.
    currency = models.CharField(
        max_length=3,
        choices=Currency.choices,
    )

    exchange_rate = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=1,
        validators=[
            MinValueValidator(Decimal("0.0001")),
        ],
    )

    margin_percentage = models.DecimalField(
        max_digits=8,
        decimal_places=4,
        default=0,
        validators=[
            MinValueValidator(Decimal("0")),
        ],
    )

    suggested_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Precio de venta sugerido, en colones.",
    )

    calculated_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        db_table = "inventory_product_cost_history"
        verbose_name = "Histórico de costo"
        verbose_name_plural = "Históricos de costos"
        ordering = [
            "-calculated_at",
            "-id",
        ]

    def __str__(self):
        return (
            f"{self.product.standard_code} - "
            f"{self.purchase.invoice_number}"
        )