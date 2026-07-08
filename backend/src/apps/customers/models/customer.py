from django.db import models

from apps.core.models import ActivableModel, AuditModel


class Customer(AuditModel, ActivableModel):
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    identification = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "customers_customers"
        verbose_name = "Cliente"
        verbose_name_plural = "Clientes"
        ordering = ["name"]

    def save(self, *args, **kwargs):
        self.name = self.name.strip().upper()
        self.phone = self.phone.strip()
        self.identification = self.identification.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name