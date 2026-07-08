from django.core.validators import MinValueValidator, RegexValidator
from django.db import models

from apps.core.models import ActivableModel, AuditModel


class StorageLocation(AuditModel, ActivableModel):
    """
    Ubicación física dentro de la bodega.

    Ejemplos:
        A124
        B015
        I300
    """

    shelf_letter = models.CharField(
        max_length=1,
        validators=[
            RegexValidator(
                regex=r"^[A-Z]$",
                message="La letra del estante debe ser una única letra mayúscula.",
            )
        ],
    )

    shelf_number = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )

    code = models.CharField(
        max_length=10,
        unique=True,
        editable=False,
    )

    description = models.CharField(
        max_length=255,
        blank=True,
    )

    class Meta:
        db_table = "inventory_storage_locations"
        verbose_name = "Ubicación"
        verbose_name_plural = "Ubicaciones"
        ordering = ["shelf_letter", "shelf_number"]
        indexes = [
            models.Index(
                fields=["shelf_letter"],
                name="idx_location_shelf",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["shelf_letter", "shelf_number"],
                name="uq_storage_location",
            ),
        ]

    def save(self, *args, **kwargs):
        self.shelf_letter = self.shelf_letter.upper()
        self.code = f"{self.shelf_letter}{self.shelf_number}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.code