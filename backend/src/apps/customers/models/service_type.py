from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel



class ServiceType(AuditModel, ActivableModel):
    """
    Catálogo persistente de tipos de servicio (ej. "arreglar carro").

    Desde el punto 1A del plan del 2026-10-22 tiene precio de mano de obra
    (se precarga al cobrar; editable en cada servicio) y una descripción de
    lo que incluye. El kit de accesorios se quitó: descontaba inventario por
    suposición; los accesorios se agregan a mano con lo que de verdad se
    usó.
    """

    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True)
    default_labor_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.0001"))],
        help_text="Precio de mano de obra que se propone al cobrar este servicio.",
    )

    class Meta:
        db_table = "customers_service_types"
        verbose_name = "Tipo de servicio"
        verbose_name_plural = "Tipos de servicio"
        ordering = ["name"]

    def save(self, *args, **kwargs):
        self.name = self.name.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name
