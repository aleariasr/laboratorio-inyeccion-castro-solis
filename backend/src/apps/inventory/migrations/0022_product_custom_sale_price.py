import django.core.validators
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0021_stockmovement_service_accessory'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='custom_sale_price',
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                help_text=(
                    'Precio de venta elegido manualmente. Si está definido, '
                    'tiene prioridad sobre el último precio sugerido calculado '
                    'a partir de una compra.'
                ),
                max_digits=12,
                null=True,
                validators=[django.core.validators.MinValueValidator(Decimal('0.0001'))],
            ),
        ),
    ]
