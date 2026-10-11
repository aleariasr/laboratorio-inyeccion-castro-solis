from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel, PaymentMethod
from apps.core.money import DiscountType

from .injector import Injector


class InjectorServiceStatus(models.TextChoices):
    RECEIVED = "RECEIVED", "Recibido"
    IN_PROGRESS = "IN_PROGRESS", "En proceso"
    READY = "READY", "Listo"
    DELIVERED = "DELIVERED", "Entregado"
    CANCELLED = "CANCELLED", "Anulado"


class InjectorServiceRecord(AuditModel, ActivableModel):
    injector = models.ForeignKey(
        Injector,
        on_delete=models.PROTECT,
        related_name="service_records",
    )

    received_at = models.DateTimeField()

    delivered_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    resistance = models.DecimalField(
        max_digits=8,
        decimal_places=3,
        null=True,
        blank=True,
    )

    leakage = models.DecimalField(
        max_digits=8,
        decimal_places=3,
        null=True,
        blank=True,
    )

    inductance = models.DecimalField(
        max_digits=8,
        decimal_places=3,
        null=True,
        blank=True,
    )

    isolation = models.DecimalField(
        max_digits=8,
        decimal_places=3,
        null=True,
        blank=True,
    )

    price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.0001"))],
    )

    payment_method = models.CharField(
        max_length=15,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
    )

    service_type = models.ForeignKey(
        "customers.ServiceType",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_records",
    )

    notes_before = models.TextField(blank=True)

    notes_after = models.TextField(blank=True)

    observations = models.TextField(blank=True)

    status = models.CharField(
        max_length=20,
        choices=InjectorServiceStatus.choices,
        default=InjectorServiceStatus.RECEIVED,
    )

    # Descuento e impuesto al documento (punto 26), igual que la venta:
    # price es el subtotal (mano de obra + accesorios). Solo el
    # Administrador los define (punto 25). Ver apps/core/money.py.
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

    # Montos congelados al entregar (deliver_service). Nulos antes: ahí
    # se calculan en vivo. La caja suma total_amount.
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
        db_table = "customers_injector_service_records"
        verbose_name = "Servicio de inyector"
        verbose_name_plural = "Servicios de inyectores"
        ordering = [
            "-received_at",
            "-id",
        ]

    def __str__(self):
        return (
            f"{self.injector.injector_number} "
            f"{self.received_at:%Y-%m-%d}"
        )