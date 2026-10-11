import django.core.validators
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Punto 18: impuestos cobrados y descuentos dados de la semana, fijados
    al cerrar. Los cierres existentes quedan en 0, que es lo correcto:
    antes de los puntos 19 y 26 no existían ni impuesto ni descuento.
    """

    dependencies = [
        ("cash", "0003_alter_cashclosing_expected_card_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="cashclosing",
            name="expected_tax",
            field=models.DecimalField(
                decimal_places=4,
                default=0,
                help_text=(
                    "Impuestos cobrados esa semana (ventas y servicios), "
                    "incluidos en expected_total. No son ingreso del negocio."
                ),
                max_digits=14,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0")),
                ],
            ),
        ),
        migrations.AddField(
            model_name="cashclosing",
            name="expected_discount",
            field=models.DecimalField(
                decimal_places=4,
                default=0,
                help_text=(
                    "Descuentos dados esa semana. Informativo: ya están "
                    "restados de expected_total."
                ),
                max_digits=14,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0")),
                ],
            ),
        ),
    ]
