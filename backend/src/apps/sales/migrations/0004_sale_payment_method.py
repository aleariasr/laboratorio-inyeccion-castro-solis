from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0003_sale_cancellation_reason'),
    ]

    operations = [
        migrations.AddField(
            model_name='sale',
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
