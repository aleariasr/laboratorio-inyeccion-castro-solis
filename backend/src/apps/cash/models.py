from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import AuditModel


class CashClosing(AuditModel):
    """
    Cierre de caja semanal (sábado a viernes).

    Se crea una sola vez por semana: expected_cash_total se calcula
    y se guarda ("se fija") en el momento del cierre, a partir de las
    ventas y servicios en efectivo confirmados/entregados en ese
    rango de fechas. No se recalcula después aunque esas ventas o
    servicios se editen más tarde — un cierre ya hecho es un registro
    histórico. created_by/created_at (de AuditModel) son quién y
    cuándo se hizo el cierre; no existe edición posterior.
    """

    week_start = models.DateField(
        unique=True,
        help_text="Sábado de inicio de la semana que cubre este cierre.",
    )

    week_end = models.DateField(
        help_text="Viernes de cierre (week_start + 6 días).",
    )

    expected_cash_total = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Efectivo esperado según ventas y servicios, calculado al momento del cierre.",
    )

    counted_cash_total = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Efectivo contado físicamente al hacer el cierre.",
    )

    difference = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        help_text="counted_cash_total menos expected_cash_total.",
    )

    difference_reason = models.TextField(
        blank=True,
        help_text="Obligatorio cuando difference no es cero.",
    )

    notes = models.TextField(blank=True)

    class Meta:
        db_table = "cash_closings"
        verbose_name = "Cierre de caja"
        verbose_name_plural = "Cierres de caja"
        ordering = ["-week_start"]

    def __str__(self):
        return f"Cierre {self.week_start:%Y-%m-%d} — {self.week_end:%Y-%m-%d}"
