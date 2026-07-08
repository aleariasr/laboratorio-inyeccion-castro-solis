from django.db import models

from apps.core.models import ActivableModel, AuditModel

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

    notes_before = models.TextField(blank=True)

    notes_after = models.TextField(blank=True)

    observations = models.TextField(blank=True)

    status = models.CharField(
        max_length=20,
        choices=InjectorServiceStatus.choices,
        default=InjectorServiceStatus.RECEIVED,
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