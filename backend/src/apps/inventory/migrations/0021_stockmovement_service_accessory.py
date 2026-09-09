import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0020_alter_storagelocation_code'),
        ('customers', '0009_injectorserviceaccessory_product'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stockmovement',
            name='movement_type',
            field=models.CharField(
                choices=[
                    ('ENTRY', 'Entrada'),
                    ('EXIT', 'Salida'),
                    ('ADJUSTMENT', 'Ajuste'),
                    ('INITIAL', 'Inventario inicial'),
                    ('REVERSAL', 'Reversión'),
                    ('SERVICE_USE', 'Uso en servicio'),
                ],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='stockmovement',
            name='service_accessory',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='stock_movements',
                to='customers.injectorserviceaccessory',
            ),
        ),
    ]
