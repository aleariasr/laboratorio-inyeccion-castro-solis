from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    """
    Modelo abstracto que agrega fechas de creación y modificación.
    """

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ActivableModel(models.Model):
    """
    Modelo abstracto para entidades que pueden activarse o desactivarse.
    """

    is_active = models.BooleanField(default=True)

    class Meta:
        abstract = True


class AuditModel(TimeStampedModel):
    """
    Modelo abstracto que registra quién creó y modificó un registro.
    """

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="%(class)s_created",
    )

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="%(class)s_updated",
    )

    class Meta:
        abstract = True
