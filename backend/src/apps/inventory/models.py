from django.core.validators import MinValueValidator, RegexValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel


LOCATION_CODE_VALIDATOR = RegexValidator(
    regex=r"^[A-Z][1-9][0-9]{0,3}$",
    message="El código de ubicación debe tener un formato como A124.",
)


class StorageLocation(AuditModel, ActivableModel):
    """
    Ubicación física dentro de la bodega.
    """

    code = models.CharField(
        max_length=5,
        unique=True,
        validators=[LOCATION_CODE_VALIDATOR],
        help_text="Ejemplo: A124",
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


class Product(AuditModel, ActivableModel):
    """
    Representa un tipo de pieza.
    """

    standard_code = models.CharField(
        max_length=50,
        unique=True,
        help_text="Código estándar de la pieza.",
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

    class Meta:
        db_table = "inventory_products"
        verbose_name = "Producto"
        verbose_name_plural = "Productos"
        ordering = ["standard_code"]

    def __str__(self):
        return f"{self.standard_code} - {self.name}"