from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel

from .product import Product


class Branch(AuditModel, ActivableModel):
    """
    Otra sede de la empresa, destino de los traslados (punto 6 del plan
    del 2026-10-22). Catálogo chico: se crea desde el mismo traslado y se
    renombra o desactiva desde el panel de administración.
    """

    name = models.CharField(
        max_length=100,
        unique=True,
    )

    class Meta:
        db_table = "inventory_branches"
        verbose_name = "Sede"
        verbose_name_plural = "Sedes"
        ordering = ["name"]

    def __str__(self):
        return self.name


class StockTransferStatus(models.TextChoices):
    DRAFT = "DRAFT", "Borrador"
    CONFIRMED = "CONFIRMED", "Confirmado"
    CANCELLED = "CANCELLED", "Anulado"


class StockTransfer(AuditModel):
    """
    Traslado de mercadería a otra sede (punto 6). Mismo ciclo que una
    venta: en borrador se arman las líneas; al confirmarlo sale el
    inventario (movimientos TRANSFER_OUT); al anular uno confirmado
    vuelve (reversiones). Solo salidas: no hay devoluciones desde la
    otra sede.
    """

    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="stock_transfers",
    )

    transfer_date = models.DateField()

    status = models.CharField(
        max_length=15,
        choices=StockTransferStatus.choices,
        default=StockTransferStatus.DRAFT,
    )

    notes = models.TextField(blank=True)

    confirmed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="confirmed_stock_transfers",
        null=True,
        blank=True,
    )

    cancelled_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cancelled_stock_transfers",
        null=True,
        blank=True,
    )

    cancellation_reason = models.TextField(blank=True)

    class Meta:
        db_table = "inventory_stock_transfers"
        verbose_name = "Traslado"
        verbose_name_plural = "Traslados"
        ordering = ["-transfer_date", "-id"]

    def __str__(self):
        return f"Traslado #{self.id or 'sin guardar'}"


class StockTransferItem(AuditModel):
    stock_transfer = models.ForeignKey(
        StockTransfer,
        on_delete=models.CASCADE,
        related_name="items",
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="stock_transfer_items",
    )

    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
    )

    class Meta:
        db_table = "inventory_stock_transfer_items"
        verbose_name = "Línea de traslado"
        verbose_name_plural = "Líneas de traslado"
        constraints = [
            models.UniqueConstraint(
                fields=["stock_transfer", "product"],
                name="uq_stock_transfer_product",
            )
        ]

    def __str__(self):
        return f"{self.stock_transfer_id} - {self.product.standard_code}"
