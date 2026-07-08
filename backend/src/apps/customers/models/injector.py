from django.db import models

from apps.core.models import ActivableModel, AuditModel

from .customer import Customer


class Injector(AuditModel, ActivableModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="injectors",
    )

    injector_number = models.CharField(max_length=100)
    description = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "customers_injectors"
        verbose_name = "Inyector"
        verbose_name_plural = "Inyectores"
        ordering = ["injector_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "injector_number"],
                name="uq_customer_injector_number",
            )
        ]

    def save(self, *args, **kwargs):
        self.injector_number = self.injector_number.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.customer} - {self.injector_number}"