from django.db import models

from apps.core.models import ActivableModel, AuditModel


class InjectorAccessory(AuditModel, ActivableModel):
    name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "customers_injector_accessories"
        verbose_name = "Accesorio de inyector"
        verbose_name_plural = "Accesorios de inyector"
        ordering = ["name"]

    def save(self, *args, **kwargs):
        self.name = self.name.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name