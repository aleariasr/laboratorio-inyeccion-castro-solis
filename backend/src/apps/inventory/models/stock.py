from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import AuditModel

from .catalog import StockMovementType
from .product import Product
from .purchase import PurchaseItem

from apps.inventory.exceptions import InventoryError

class StockMovement(AuditModel):
    """
    Fuente única de verdad para las existencias.
    Ningún otro modelo modifica el inventario directamente.
    """

    _allow_save = False

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )

    movement_type = models.CharField(
        max_length=20,
        choices=StockMovementType.choices,
    )

    quantity = models.PositiveIntegerField(
        validators=[
            MinValueValidator(1),
        ],
    )

    purchase_item = models.ForeignKey(
        PurchaseItem,
        on_delete=models.PROTECT,
        related_name="stock_movements",
        null=True,
        blank=True,
    )

    notes = models.TextField(
        blank=True,
    )

    class Meta:
        db_table = "inventory_stock_movements"
        verbose_name = "Movimiento de inventario"
        verbose_name_plural = "Movimientos de inventario"
        ordering = [
            "-created_at",
            "-id",
        ]

    def clean(self):
        if (
            self.movement_type == StockMovementType.ENTRY
            and self.purchase_item is None
        ):
            raise ValidationError(
                "Un movimiento de entrada debe estar asociado a una línea de compra."
            )

    def save(self, *args, **kwargs):
        if not self._allow_save:
            raise InventoryError(
                "Los movimientos de inventario solo pueden crearse mediante servicios del dominio."
            )

        super().save(*args, **kwargs)

    @classmethod
    def create_from_service(cls, **kwargs):
        movement = cls(**kwargs)
        movement._allow_save = True
        movement.save()
        return movement

    def __str__(self):
        return (
            f"{self.product.standard_code} "
            f"{self.movement_type} "
            f"{self.quantity}"
        )