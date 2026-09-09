from decimal import Decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cash', '0001_initial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='cashclosing',
            old_name='expected_cash_total',
            new_name='expected_total',
        ),
        migrations.RenameField(
            model_name='cashclosing',
            old_name='counted_cash_total',
            new_name='counted_total',
        ),
        migrations.AlterField(
            model_name='cashclosing',
            name='expected_total',
            field=models.DecimalField(
                decimal_places=4,
                help_text=(
                    'Total esperado según ventas y servicios confirmados/entregados '
                    'esa semana, sumando los 4 métodos de pago. Calculado y fijado '
                    'al momento del cierre.'
                ),
                max_digits=14,
                validators=[django.core.validators.MinValueValidator(Decimal('0'))],
            ),
        ),
        migrations.AlterField(
            model_name='cashclosing',
            name='counted_total',
            field=models.DecimalField(
                decimal_places=4,
                help_text=(
                    'Total contado/verificado físicamente al hacer el cierre '
                    '(efectivo + vouchers de tarjeta + comprobantes de transferencia '
                    '+ otros, todo junto en un solo monto).'
                ),
                max_digits=14,
                validators=[django.core.validators.MinValueValidator(Decimal('0'))],
            ),
        ),
        migrations.AlterField(
            model_name='cashclosing',
            name='difference',
            field=models.DecimalField(
                decimal_places=4,
                help_text='counted_total menos expected_total.',
                max_digits=14,
            ),
        ),
        migrations.AddField(
            model_name='cashclosing',
            name='expected_cash',
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal('0'),
                help_text='Desglose de expected_total: solo lo pagado en efectivo.',
                max_digits=14,
                validators=[django.core.validators.MinValueValidator(Decimal('0'))],
            ),
        ),
        migrations.AddField(
            model_name='cashclosing',
            name='expected_card',
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal('0'),
                help_text='Desglose de expected_total: solo lo pagado con tarjeta.',
                max_digits=14,
                validators=[django.core.validators.MinValueValidator(Decimal('0'))],
            ),
        ),
        migrations.AddField(
            model_name='cashclosing',
            name='expected_transfer',
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal('0'),
                help_text='Desglose de expected_total: solo lo pagado por transferencia.',
                max_digits=14,
                validators=[django.core.validators.MinValueValidator(Decimal('0'))],
            ),
        ),
        migrations.AddField(
            model_name='cashclosing',
            name='expected_other',
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal('0'),
                help_text='Desglose de expected_total: otros métodos de pago.',
                max_digits=14,
                validators=[django.core.validators.MinValueValidator(Decimal('0'))],
            ),
        ),
    ]
