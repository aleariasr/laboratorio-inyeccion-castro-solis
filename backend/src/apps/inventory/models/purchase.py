from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel

from .catalog import Currency, PurchaseStatus
from .supplier import Supplier, SupplierProduct


class Purchase(AuditModel, ActivableModel):
    """
    Cabecera de una compra.
    """

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchases",
    )

    invoice_number = models.CharField(
        max_length=100,
    )

    purchase_date = models.DateField()

    currency = models.CharField(
        max_length=3,
        choices=Currency.choices,
        help_text="ISO 4217.",
    )

    exchange_rate = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=1,
        validators=[
            MinValueValidator(Decimal("0.0001")),
        ]
    )

    status = models.CharField(
        max_length=15,
        choices=PurchaseStatus.choices,
        default=PurchaseStatus.DRAFT,
    )

    notes = models.TextField(
        blank=True,
    )

    class Meta:
        db_table = "inventory_purchases"
        verbose_name = "Compra"
        verbose_name_plural = "Compras"
        ordering = [
            "-purchase_date",
            "-id",
        ]
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "supplier",
                    "invoice_number",
                ],
                name="uq_supplier_invoice",
            ),
        ]

    def save(self, *args, **kwargs):
        self.invoice_number = self.invoice_number.strip().upper()
        self.currency = self.currency.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.invoice_number


class PurchaseItem(AuditModel):
    """
    Línea de una compra.
    """

    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.CASCADE,
        related_name="items",
    )

    supplier_product = models.ForeignKey(
        SupplierProduct,
        on_delete=models.PROTECT,
        related_name="purchase_items",
    )

    quantity = models.PositiveIntegerField(
        validators=[
            MinValueValidator(1),
        ],
    )

    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[
            MinValueValidator(Decimal("0.0001")),
        ]
    )

    class Meta:
        db_table = "inventory_purchase_items"
        verbose_name = "Línea de compra"
        verbose_name_plural = "Líneas de compra"
        ordering = [
            "id",
        ]
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "purchase",
                    "supplier_product",
                ],
                name="uq_purchase_supplier_product",
            ),
        ]

    def __str__(self):
        return (
            f"{self.purchase.invoice_number} - "
            f"{self.supplier_product.product.standard_code}"
        )