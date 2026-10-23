import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Punto 1A del plan del 2026-10-22: tipo de servicio completo.

    - Precio de mano de obra (nulo en los tipos existentes).
    - La descripción pasa de 255 caracteres a texto libre (no pierde
      nada: todo texto existente cabe).
    - Tabla nueva del kit de accesorios (vacía).

    Aditiva: no cambia ningún dato existente.
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("inventory", "0026_product_own_code"),
        ("customers", "0011_service_discount_tax_amounts"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicetype",
            name="default_labor_price",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                help_text=(
                    "Precio de mano de obra que se propone al cobrar este servicio."
                ),
                max_digits=12,
                null=True,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0.0001")),
                ],
            ),
        ),
        migrations.AlterField(
            model_name="servicetype",
            name="description",
            field=models.TextField(blank=True),
        ),
        migrations.CreateModel(
            name="ServiceTypeAccessory",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "quantity",
                    models.PositiveIntegerField(
                        default=1,
                        validators=[django.core.validators.MinValueValidator(1)],
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(class)s_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="service_type_kit_items",
                        to="inventory.product",
                    ),
                ),
                (
                    "service_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="kit_items",
                        to="customers.servicetype",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(class)s_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Accesorio del tipo de servicio",
                "verbose_name_plural": "Accesorios del tipo de servicio",
                "db_table": "customers_service_type_accessories",
                "ordering": ["id"],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("service_type", "product"),
                        name="uq_service_type_accessory",
                    )
                ],
            },
        ),
    ]
