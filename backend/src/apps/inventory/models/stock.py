from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import AuditModel
from apps.inventory.exceptions import InventoryError

from .catalog import StockMovementType
from .product import Product
from .purchase import PurchaseItem


class MovementDirection(models.TextChoices):
    IN = "IN", "Entrada"
    OUT = "OUT", "Salida"


class StockMovement(AuditModel):
    """
    Fuente única de verdad para las existencias.

    Ningún otro modelo debe modificar el inventario directamente.
    Toda entrada o salida debe registrarse mediante un servicio del dominio.
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

    direction = models.CharField(
        max_length=3,
        choices=MovementDirection.choices,
        default=MovementDirection.IN,
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

    sale_item = models.ForeignKey(
        "sales.SaleItem",
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
            and self.direction == MovementDirection.IN
        ):
            raise ValidationError(
                "Una entrada debe estar asociada a una línea de compra."
            )

        if (
            self.movement_type == StockMovementType.EXIT
            and self.sale_item is None
            and self.direction == MovementDirection.OUT
        ):
            raise ValidationError(
                "Una salida debe estar asociada a una línea de venta."
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
            f"{self.product.standard_code} | "
            f"{self.direction} | "
            f"{self.quantity}"
        )