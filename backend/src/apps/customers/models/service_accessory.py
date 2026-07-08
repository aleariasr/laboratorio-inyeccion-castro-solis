from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import AuditModel

from .accessory import InjectorAccessory
from .service_record import InjectorServiceRecord


class InjectorServiceAccessory(AuditModel):
    service_record = models.ForeignKey(
        InjectorServiceRecord,
        on_delete=models.CASCADE,
        related_name="accessories",
    )

    accessory = models.ForeignKey(
        InjectorAccessory,
        on_delete=models.PROTECT,
        related_name="service_records",
    )

    quantity = models.PositiveIntegerField(
        default=1,
        validators=[
            MinValueValidator(1),
        ],
    )

    notes = models.CharField(
        max_length=255,
        blank=True,
    )

    class Meta:
        db_table = "customers_injector_service_accessories"
        verbose_name = "Accesorio utilizado"
        verbose_name_plural = "Accesorios utilizados"

        constraints = [
            models.UniqueConstraint(
                fields=[
                    "service_record",
                    "accessory",
                ],
                name="uq_service_accessory",
            )
        ]

    def __str__(self):
        return (
            f"{self.service_record} - "
            f"{self.accessory}"
        )