import decimal

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0007_injectorservicerecord_price'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ServiceType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True)),
                ('name', models.CharField(max_length=150, unique=True)),
                ('description', models.CharField(blank=True, max_length=255)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_created', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Tipo de servicio',
                'verbose_name_plural': 'Tipos de servicio',
                'db_table': 'customers_service_types',
                'ordering': ['name'],
            },
        ),
        migrations.AddField(
            model_name='injectorservicerecord',
            name='service_type',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='service_records', to='customers.servicetype'),
        ),
        migrations.CreateModel(
            name='ServiceTypePriceHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('price', models.DecimalField(decimal_places=4, max_digits=12, validators=[django.core.validators.MinValueValidator(decimal.Decimal('0.0001'))])),
                ('charged_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_created', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_updated', to=settings.AUTH_USER_MODEL)),
                ('service_record', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='service_type_history_entries', to='customers.injectorservicerecord')),
                ('service_type', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='price_history', to='customers.servicetype')),
            ],
            options={
                'verbose_name': 'Histórico de precio de tipo de servicio',
                'verbose_name_plural': 'Histórico de precios de tipo de servicio',
                'db_table': 'customers_service_type_price_history',
                'ordering': ['-charged_at', '-id'],
            },
        ),
        migrations.AddConstraint(
            model_name='servicetypepricehistory',
            constraint=models.UniqueConstraint(fields=('service_type', 'service_record'), name='uq_service_type_price_history'),
        ),
    ]
