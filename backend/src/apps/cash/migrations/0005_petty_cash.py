import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Caja chica (puntos 21 + 22): tabla nueva de salidas y tres columnas
    en el cierre (fondo inicial, salidas y fondo de la semana siguiente).
    Los cierres existentes quedan en 0: antes no había caja chica, y con
    0 su diferencia sigue siendo exactamente la que se guardó.
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("cash", "0004_cashclosing_expected_tax_discount"),
    ]

    operations = [
        migrations.AddField(
            model_name="cashclosing",
            name="petty_cash_opening",
            field=models.DecimalField(
                decimal_places=4,
                default=0,
                help_text="Fondo de caja chica al inicio de la semana.",
                max_digits=14,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0")),
                ],
            ),
        ),
        migrations.AddField(
            model_name="cashclosing",
            name="petty_cash_outflows",
            field=models.DecimalField(
                decimal_places=4,
                default=0,
                help_text="Suma de las salidas de caja chica de la semana.",
                max_digits=14,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0")),
                ],
            ),
        ),
        migrations.AddField(
            model_name="cashclosing",
            name="next_petty_cash_opening",
            field=models.DecimalField(
                decimal_places=4,
                default=0,
                help_text=(
                    "Fondo de caja chica con el que arranca la semana siguiente."
                ),
                max_digits=14,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0")),
                ],
            ),
        ),
        migrations.CreateModel(
            name="PettyCashMovement",
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
                ("date", models.DateField()),
                (
                    "amount",
                    models.DecimalField(
                        decimal_places=4,
                        max_digits=14,
                        validators=[
                            django.core.validators.MinValueValidator(
                                Decimal("0.01"),
                            ),
                        ],
                    ),
                ),
                ("reason", models.CharField(max_length=255)),
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
                "verbose_name": "Salida de caja chica",
                "verbose_name_plural": "Salidas de caja chica",
                "db_table": "cash_petty_cash_movements",
                "ordering": ["-date", "-id"],
            },
        ),
    ]
