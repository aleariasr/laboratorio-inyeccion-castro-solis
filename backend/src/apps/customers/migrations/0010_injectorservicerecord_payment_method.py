from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0009_injectorserviceaccessory_product'),
    ]

    operations = [
        migrations.AddField(
            model_name='injectorservicerecord',
            name='payment_method',
            field=models.CharField(
                choices=[
                    ('CASH', 'Efectivo'),
                    ('CARD', 'Tarjeta'),
                    ('TRANSFER', 'Transferencia'),
                    ('OTHER', 'Otro'),
                ],
                default='CASH',
                max_length=15,
            ),
        ),
    ]
