from django.db import models

from apps.core.models import ActivableModel, AuditModel


class CustomerType(models.TextChoices):
    PERSON = "PERSON", "Persona"
    COMPANY = "COMPANY", "Empresa"


class Customer(AuditModel, ActivableModel):
    customer_type = models.CharField(
        max_length=20,
        choices=CustomerType.choices,
        default=CustomerType.PERSON,
    )

    display_name = models.CharField(
        max_length=150,
    )

    phone = models.CharField(
        max_length=30,
        blank=True,
    )

    email = models.EmailField(
        blank=True,
    )

    identification = models.CharField(
        max_length=50,
        blank=True,
    )

    notes = models.TextField(
        blank=True,
    )

    class Meta:
        db_table = "customers_customers"
        verbose_name = "Cliente"
        verbose_name_plural = "Clientes"
        ordering = [
            "display_name",
        ]

    def save(self, *args, **kwargs):
        self.display_name = self.display_name.strip().upper()
        self.phone = self.phone.strip()
        self.identification = self.identification.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.display_name