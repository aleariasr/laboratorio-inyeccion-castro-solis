from django.db import models

from apps.core.models import ActivableModel, AuditModel

from .product import Product


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


class SupplierProduct(AuditModel, ActivableModel):
    """
    Relación entre un proveedor y un producto.
    """

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="supplier_products",
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="supplier_products",
    )

    supplier_reference = models.CharField(
        max_length=80,
        blank=True,
        help_text="Código usado por el proveedor.",
    )

    manufacturer = models.CharField(
        max_length=100,
        blank=True,
        help_text="Marca o fabricante con el que el proveedor comercializa la pieza.",
    )

    preferred_supplier = models.BooleanField(
        default=False,
        help_text="Indica si es el proveedor preferido para este producto.",
    )

    notes = models.TextField(
        blank=True,
    )

    class Meta:
        db_table = "inventory_supplier_products"
        verbose_name = "Producto de proveedor"
        verbose_name_plural = "Productos de proveedores"
        ordering = ["supplier__name", "product__standard_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["supplier", "product", "supplier_reference"],
                name="uq_supplier_product",
            )
        ]

    def __str__(self):
        return f"{self.supplier} - {self.product.standard_code}"