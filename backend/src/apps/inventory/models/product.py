from decimal import Decimal

from django.core.validators import MinValueValidator, RegexValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel


LOCATION_CODE_VALIDATOR = RegexValidator(
    regex=r"^[A-Za-z0-9]+$",
    message="El código de ubicación solo puede tener letras y números, sin espacios.",
)


class StorageLocation(AuditModel, ActivableModel):
    """
    Ubicación física dentro de la bodega.
    """

    code = models.CharField(
        max_length=10,
        unique=True,
        validators=[LOCATION_CODE_VALIDATOR],
        help_text="Letras y números, sin espacios. Ejemplo: A124 o BODEGA1.",
    )

    description = models.CharField(
        max_length=255,
        blank=True,
    )

    class Meta:
        db_table = "inventory_storage_locations"
        verbose_name = "Ubicación"
        verbose_name_plural = "Ubicaciones"
        ordering = ["code"]

    def save(self, *args, **kwargs):
        self.code = self.code.upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.code


class VariantKind(models.TextChoices):
    """
    Distingue variantes de un mismo código universal (standard_code)
    representadas como filas Product separadas — ver §3.6: un
    original y su equivalente genérico son productos distintos, cada
    uno con su propio precio y stock, pero comparten standard_code.

    Lo habitual es que compartan también storage_location, y por eso
    `add-variant` copia la del producto padre, pero NO es una
    restricción: en los datos reales del cliente hay 152 familias de
    equivalentes repartidas en estantes distintos, y forzarlo impedía
    reubicar una familia.
    """

    ORIGINAL = "ORIGINAL", "Original"
    GENERIC = "GENERIC", "Genérico"
    OTHER = "OTHER", "Otro"


class Product(AuditModel, ActivableModel):
    """
    Representa un tipo de pieza.
    """

    standard_code = models.CharField(
        max_length=50,
        db_index=True,
        help_text=(
            "Código estándar de la pieza (\"código universal\"). "
            "Varias filas Product pueden compartir el mismo código "
            "para representar distintas variantes (original, "
            "genérico, etc.) de la misma pieza."
        ),
    )

    variant_kind = models.CharField(
        max_length=10,
        choices=VariantKind.choices,
        default=VariantKind.ORIGINAL,
    )

    name = models.CharField(
        max_length=150,
    )

    description = models.TextField(
        blank=True,
    )

    storage_location = models.ForeignKey(
        StorageLocation,
        on_delete=models.PROTECT,
        related_name="products",
    )

    minimum_stock = models.PositiveIntegerField(
        default=0,
        validators=[MinValueValidator(0)],
    )

    unit_of_measure = models.CharField(
        max_length=20,
        default="unidad",
    )

    custom_sale_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.0001"))],
        help_text=(
            "Precio de venta elegido manualmente. Si está definido, "
            "tiene prioridad sobre el último precio sugerido calculado "
            "a partir de una compra."
        ),
    )

    class Meta:
        db_table = "inventory_products"
        verbose_name = "Producto"
        verbose_name_plural = "Productos"
        ordering = ["standard_code"]

    def __str__(self):
        return f"{self.standard_code} - {self.name}"