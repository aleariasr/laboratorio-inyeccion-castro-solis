from decimal import Decimal

import django.core.validators
from django.db import migrations, models


def freeze_existing_amounts(apps, schema_editor):
    """
    Servicios ya entregados: subtotal = total = price, descuento e
    impuesto en 0. Es lo que se cobró, porque antes de esta migración no
    existían ni descuento ni impuesto y price era el total. Los demás
    estados quedan en nulo: su total se calcula en vivo.
    """

    InjectorServiceRecord = apps.get_model(
        "customers",
        "InjectorServiceRecord",
    )

    for record in InjectorServiceRecord.objects.filter(
        status="DELIVERED",
        price__isnull=False,
    ):
        InjectorServiceRecord.objects.filter(pk=record.pk).update(
            subtotal_amount=record.price,
            discount_amount=Decimal("0"),
            tax_amount=Decimal("0"),
            total_amount=record.price,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0010_injectorservicerecord_payment_method"),
    ]

    operations = [
        migrations.AddField(
            model_name="injectorservicerecord",
            name="discount_type",
            field=models.CharField(
                choices=[("AMOUNT", "Monto"), ("PERCENT", "Porcentaje")],
                default="AMOUNT",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="injectorservicerecord",
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
        # En 0: los servicios existentes no tenían impuesto. El 13 % de
        # los servicios nuevos lo pone la vista al recibir el inyector.
        migrations.AddField(
            model_name="injectorservicerecord",
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
            model_name="injectorservicerecord",
            name="subtotal_amount",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="injectorservicerecord",
            name="discount_amount",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="injectorservicerecord",
            name="tax_amount",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="injectorservicerecord",
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
