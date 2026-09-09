from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel

from .service_record import InjectorServiceRecord


class ServiceType(AuditModel, ActivableModel):
    """
    Catálogo persistente de tipos de servicio (ej. "arreglar carro").
    """

    name = models.CharField(max_length=150, unique=True)
    description = models.CharField(max_length=255, blank=True)

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


class ServiceTypePriceHistory(AuditModel):
    """
    Histórico del precio cobrado cada vez que se usó un tipo de servicio,
    para mostrarlo como referencia (nunca como valor obligatorio).
    """

    service_type = models.ForeignKey(
        ServiceType,
        on_delete=models.PROTECT,
        related_name="price_history",
    )

    service_record = models.ForeignKey(
        InjectorServiceRecord,
        on_delete=models.PROTECT,
        related_name="service_type_history_entries",
    )

    price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0.0001"))],
    )

    charged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "customers_service_type_price_history"
        verbose_name = "Histórico de precio de tipo de servicio"
        verbose_name_plural = "Histórico de precios de tipo de servicio"
        ordering = ["-charged_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["service_type", "service_record"],
                name="uq_service_type_price_history",
            )
        ]

    def __str__(self):
        return f"{self.service_type} - {self.service_record}"
