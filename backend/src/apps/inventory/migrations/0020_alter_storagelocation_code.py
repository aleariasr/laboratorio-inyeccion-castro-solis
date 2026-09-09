import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0019_remove_supplierproduct_supplier_reference'),
    ]

    operations = [
        migrations.AlterField(
            model_name='storagelocation',
            name='code',
            field=models.CharField(
                help_text='Letras y números, sin espacios. Ejemplo: A124 o BODEGA1.',
                max_length=10,
                unique=True,
                validators=[
                    django.core.validators.RegexValidator(
                        message='El código de ubicación solo puede tener letras y números, sin espacios.',
                        regex='^[A-Za-z0-9]+$',
                    )
                ],
            ),
        ),
    ]
