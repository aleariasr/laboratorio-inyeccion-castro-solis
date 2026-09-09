import decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0006_injectorservicerecord_inductance_isolation'),
    ]

    operations = [
        migrations.AddField(
            model_name='injectorservicerecord',
            name='price',
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=12,
                null=True,
                validators=[django.core.validators.MinValueValidator(decimal.Decimal('0.0001'))],
            ),
        ),
    ]
