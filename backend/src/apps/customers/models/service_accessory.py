from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import AuditModel

from .service_record import InjectorServiceRecord


class InjectorServiceAccessory(AuditModel):
    service_record = models.ForeignKey(
        InjectorServiceRecord,
        on_delete=models.CASCADE,
        related_name="accessories",
    )

    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.PROTECT,
        related_name="service_accessories",
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

    # Precio de cada unidad, fijado al agregar el accesorio (por defecto,
    # el precio de venta del producto en ese momento). Si después cambia el
    # precio del producto, el servicio no cambia solo (punto 3 + 1B del plan
    # del 2026-10-22). Lo ve y lo cambia solo el Administrador.
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
    )

    class Meta:
        db_table = "customers_injector_service_accessories"
        verbose_name = "Accesorio utilizado"
        verbose_name_plural = "Accesorios utilizados"

        constraints = [
            models.UniqueConstraint(
                fields=[
                    "service_record",
                    "product",
                ],
                name="uq_service_accessory",
            )
        ]

    def __str__(self):
        return (
            f"{self.service_record} - "
            f"{self.product}"
        )