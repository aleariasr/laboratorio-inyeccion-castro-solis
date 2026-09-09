import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CashClosing',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('week_start', models.DateField(help_text='Sábado de inicio de la semana que cubre este cierre.', unique=True)),
                ('week_end', models.DateField(help_text='Viernes de cierre (week_start + 6 días).')),
                ('expected_cash_total', models.DecimalField(decimal_places=4, help_text='Efectivo esperado según ventas y servicios, calculado al momento del cierre.', max_digits=14, validators=[django.core.validators.MinValueValidator(Decimal('0'))])),
                ('counted_cash_total', models.DecimalField(decimal_places=4, help_text='Efectivo contado físicamente al hacer el cierre.', max_digits=14, validators=[django.core.validators.MinValueValidator(Decimal('0'))])),
                ('difference', models.DecimalField(decimal_places=4, help_text='counted_cash_total menos expected_cash_total.', max_digits=14)),
                ('difference_reason', models.TextField(blank=True, help_text='Obligatorio cuando difference no es cero.')),
                ('notes', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_created', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Cierre de caja',
                'verbose_name_plural': 'Cierres de caja',
                'db_table': 'cash_closings',
                'ordering': ['-week_start'],
            },
        ),
    ]
