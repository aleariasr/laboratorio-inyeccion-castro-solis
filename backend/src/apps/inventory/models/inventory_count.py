from django.db import models

from apps.core.models import ActivableModel, AuditModel

from .product import Product


class InventoryCountStatus(models.TextChoices):
    DRAFT = "DRAFT", "Borrador"
    APPROVED = "APPROVED", "Aprobado"
    CANCELLED = "CANCELLED", "Anulado"


class InventoryCount(AuditModel, ActivableModel):
    """
    Documento de conteo físico de inventario.
    """

    reference = models.CharField(
        max_length=50,
        unique=True,
    )

    count_date = models.DateField()

    status = models.CharField(
        max_length=15,
        choices=InventoryCountStatus.choices,
        default=InventoryCountStatus.DRAFT,
    )

    notes = models.TextField(
        blank=True,
    )

    class Meta:
        db_table = "inventory_counts"
        verbose_name = "Conteo de inventario"
        verbose_name_plural = "Conteos de inventario"
        ordering = [
            "-count_date",
            "-id",
        ]

    def __str__(self):
        return self.reference


class InventoryCountItem(AuditModel):
    """
    Línea de un conteo físico.
    """

    inventory_count = models.ForeignKey(
        InventoryCount,
        on_delete=models.CASCADE,
        related_name="items",
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="inventory_counts",
    )

    counted_quantity = models.PositiveIntegerField()

    class Meta:
        db_table = "inventory_count_items"
        verbose_name = "Línea de conteo"
        verbose_name_plural = "Líneas de conteo"

        constraints = [
            models.UniqueConstraint(
                fields=[
                    "inventory_count",
                    "product",
                ],
                name="uq_inventory_count_product",
            )
        ]

    def __str__(self):
        return (
            f"{self.inventory_count.reference} - "
            f"{self.product.standard_code}"
        )