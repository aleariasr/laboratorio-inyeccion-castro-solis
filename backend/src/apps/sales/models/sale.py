from django.conf import settings
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel
from apps.customers.models import Customer
from apps.inventory.models import Product


class SaleStatus(models.TextChoices):
    DRAFT = "DRAFT", "Borrador"
    CONFIRMED = "CONFIRMED", "Confirmada"
    CANCELLED = "CANCELLED", "Anulada"


class Sale(AuditModel, ActivableModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="sales",
        null=True,
        blank=True,
    )

    sale_date = models.DateField()

    currency = models.CharField(
        max_length=3,
        default="CRC",
    )

    exchange_rate = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=1,
        validators=[MinValueValidator(Decimal("0.0001"))],
    )

    status = models.CharField(
        max_length=15,
        choices=SaleStatus.choices,
        default=SaleStatus.DRAFT,
    )

    confirmed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="confirmed_sales",
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
        related_name="cancelled_sales",
        null=True,
        blank=True,
    )

    notes = models.TextField(blank=True)

    class Meta:
        db_table = "sales_sales"
        verbose_name = "Venta"
        verbose_name_plural = "Ventas"
        ordering = ["-sale_date", "-id"]

    def __str__(self):
        return f"Venta #{self.id or 'sin guardar'}"


class SaleItem(AuditModel):
    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="items",
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="sale_items",
    )

    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
    )

    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0.0001"))],
    )

    class Meta:
        db_table = "sales_sale_items"
        verbose_name = "Línea de venta"
        verbose_name_plural = "Líneas de venta"
        constraints = [
            models.UniqueConstraint(
                fields=["sale", "product"],
                name="uq_sale_product",
            )
        ]

    def __str__(self):
        return f"{self.sale_id} - {self.product.standard_code}"