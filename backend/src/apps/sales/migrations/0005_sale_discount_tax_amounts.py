from decimal import Decimal

import django.core.validators
from django.db import migrations, models
from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import Coalesce

MONEY = DecimalField(max_digits=14, decimal_places=4)


def freeze_existing_amounts(apps, schema_editor):
    """
    Ventas ya confirmadas o anuladas: subtotal = total = suma de sus
    líneas, descuento e impuesto en 0. Es lo que fueron, porque antes de
    esta migración no existían ni descuento ni impuesto. Las de borrador
    quedan en nulo: su total se calcula en vivo.
    """

    Sale = apps.get_model("sales", "Sale")

    sales = Sale.objects.filter(
        status__in=["CONFIRMED", "CANCELLED"],
    ).annotate(
        lines_total=Coalesce(
            Sum(
                ExpressionWrapper(
                    F("items__quantity") * F("items__unit_price"),
                    output_field=MONEY,
                )
            ),
            Decimal("0"),
            output_field=MONEY,
        ),
    )

    for sale in sales:
        Sale.objects.filter(pk=sale.pk).update(
            subtotal_amount=sale.lines_total,
            discount_amount=Decimal("0"),
            tax_amount=Decimal("0"),
            total_amount=sale.lines_total,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0004_sale_payment_method"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="discount_type",
            field=models.CharField(
                choices=[("AMOUNT", "Monto"), ("PERCENT", "Porcentaje")],
                default="AMOUNT",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="sale",
            name="discount_value",
            field=models.DecimalField(
                decimal_places=4,
                default=0,
                max_digits=12,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0")),
                ],
            ),
        ),
        # En 0: las ventas existentes no tenían impuesto. El 13 % de las
        # ventas nuevas lo pone SaleSerializer al crear.
        migrations.AddField(
            model_name="sale",
            name="tax_percentage",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                max_digits=5,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0")),
                    django.core.validators.MaxValueValidator(Decimal("100")),
                ],
            ),
        ),
        migrations.AddField(
            model_name="sale",
            name="subtotal_amount",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="sale",
            name="discount_amount",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="sale",
            name="tax_amount",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="sale",
            name="total_amount",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=14,
                null=True,
            ),
        ),
        migrations.RunPython(
            freeze_existing_amounts,
            migrations.RunPython.noop,
        ),
    ]
