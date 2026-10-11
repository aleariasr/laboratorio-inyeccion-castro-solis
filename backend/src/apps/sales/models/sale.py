from django.conf import settings
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel, PaymentMethod
from apps.core.money import DEFAULT_TAX_PERCENTAGE, DiscountType

# Toda venta creada desde la API arranca con el IVA (ver
# DEFAULT_TAX_PERCENTAGE). Lo aplica SaleSerializer al crear, no el
# modelo (punto 19).
DEFAULT_SALE_TAX_PERCENTAGE = DEFAULT_TAX_PERCENTAGE
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

    payment_method = models.CharField(
        max_length=15,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
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

    cancellation_reason = models.TextField(
        blank=True,
    )

    notes = models.TextField(blank=True)

    # Descuento e impuesto al documento completo (punto 19), editables
    # solo en borrador. Ver apps/core/money.py.
    discount_type = models.CharField(
        max_length=10,
        choices=DiscountType.choices,
        default=DiscountType.AMOUNT,
    )

    discount_value = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
    )

    tax_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[
            MinValueValidator(Decimal("0")),
            MaxValueValidator(Decimal("100")),
        ],
    )

    # Montos congelados al confirmar (confirm_sale). Nulos en borrador:
    # ahí el total se calcula en vivo. La caja y los reportes suman
    # total_amount, que es lo que realmente se cobró.
    subtotal_amount = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        null=True,
        blank=True,
    )

    discount_amount = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        null=True,
        blank=True,
    )

    tax_amount = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        null=True,
        blank=True,
    )

    total_amount = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        null=True,
        blank=True,
    )

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