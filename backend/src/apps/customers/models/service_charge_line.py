from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import AuditModel

from .service_record import InjectorServiceRecord


class ServiceChargeLine(AuditModel):
    """
    Lo que se cobra por un servicio además de los accesorios (punto 3 + 1B
    del plan del 2026-10-22): "Mano de obra × 1", "Limpieza × 4"...

    El precio del servicio (InjectorServiceRecord.price) es la suma de
    estas líneas más los accesorios, y lo recalcula
    recalculate_service_price cada vez que cambia una de las dos cosas.
    Solo el Administrador las ve y las escribe (punto 25).
    """

    service_record = models.ForeignKey(
        InjectorServiceRecord,
        on_delete=models.CASCADE,
        related_name="charge_lines",
    )

    service_type = models.ForeignKey(
        "customers.ServiceType",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="charge_lines",
    )

    description = models.CharField(max_length=255)

    quantity = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
    )

    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
    )

    class Meta:
        db_table = "customers_service_charge_lines"
        verbose_name = "Línea de cobro de servicio"
        verbose_name_plural = "Líneas de cobro de servicio"
        ordering = ["id"]

    @property
    def amount(self):
        return self.unit_price * self.quantity

    def __str__(self):
        return f"{self.service_record} - {self.description} x{self.quantity}"
