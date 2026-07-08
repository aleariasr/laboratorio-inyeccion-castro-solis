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
    
class ProductReference(AuditModel, ActivableModel):
    """
    Referencia comercial o equivalente de un producto.
    """

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="references",
    )

    manufacturer = models.CharField(
        max_length=100,
        blank=True,
    )

    reference_code = models.CharField(
        max_length=80,
    )

    description = models.CharField(
        max_length=255,
        blank=True,
    )

    class Meta:
        db_table = "inventory_product_references"
        verbose_name = "Referencia de producto"
        verbose_name_plural = "Referencias de producto"
        ordering = ["reference_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "manufacturer", "reference_code"],
                name="uq_product_reference",
            )
        ]

    def save(self, *args, **kwargs):
        self.reference_code = self.reference_code.strip().upper()
        self.manufacturer = self.manufacturer.strip()
        super().save(*args, **kwargs)

    def __str__(self):
        if self.manufacturer:
            return f"{self.manufacturer} - {self.reference_code}"
        return self.reference_code
    
class Supplier(AuditModel, ActivableModel):
    """
    Empresa que suministra productos al laboratorio.
    """

    name = models.CharField(
        max_length=150,
        unique=True,
    )

    contact_name = models.CharField(
        max_length=150,
        blank=True,
    )

    phone = models.CharField(
        max_length=30,
        blank=True,
    )

    email = models.EmailField(
        blank=True,
    )

    country = models.CharField(
        max_length=100,
        blank=True,
    )

    notes = models.TextField(
        blank=True,
    )

    class Meta:
        db_table = "inventory_suppliers"
        verbose_name = "Proveedor"
        verbose_name_plural = "Proveedores"
        ordering = ["name"]

    def save(self, *args, **kwargs):
        self.name = self.name.strip().upper()
        self.contact_name = self.contact_name.strip()
        self.country = self.country.strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name