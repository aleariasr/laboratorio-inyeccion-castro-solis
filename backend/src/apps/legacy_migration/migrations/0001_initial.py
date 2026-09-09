import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='MigrationRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('status', models.CharField(choices=[('PENDING', 'Pendiente'), ('RUNNING', 'En ejecución'), ('COMPLETED', 'Completada'), ('FAILED', 'Fallida')], default='PENDING', max_length=15)),
                ('started_at', models.DateTimeField(blank=True, null=True)),
                ('finished_at', models.DateTimeField(blank=True, null=True)),
                ('summary', models.JSONField(blank=True, default=dict, help_text='Totales detectados/importados por entidad, para el reporte final.')),
                ('notes', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_created', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Ejecución de migración',
                'verbose_name_plural': 'Ejecuciones de migración',
                'db_table': 'legacy_migration_runs',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='LegacyStagingRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('source_table', models.CharField(choices=[('INVEN01', 'Proveedores'), ('INVEN03', 'Piezas / productos'), ('INVEN05', 'Compras / facturas'), ('INVEN08', 'Stock auxiliar')], max_length=10)),
                ('source_origin', models.CharField(help_text='De qué copia física vino: "bases1" o "raiz".', max_length=20)),
                ('source_key', models.CharField(db_index=True, max_length=100)),
                ('raw_data', models.JSONField(help_text='Fila cruda tal como vino del DBF (fechas como texto ISO).')),
                ('run', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='staging_records', to='legacy_migration.migrationrun')),
            ],
            options={
                'verbose_name': 'Registro en staging',
                'verbose_name_plural': 'Registros en staging',
                'db_table': 'legacy_migration_staging_records',
                'ordering': ['source_table', 'source_key'],
            },
        ),
        migrations.CreateModel(
            name='MigrationIssue',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('severity', models.CharField(choices=[('BLOCKING', 'Bloqueante'), ('WARNING', 'Advertencia'), ('INFO', 'Informativa')], max_length=10)),
                ('category', models.CharField(choices=[('PRODUCTO_HUERFANO', 'Producto referenciado que no existe en catálogo'), ('PROVEEDOR_FALTANTE', 'Proveedor referenciado que no existe'), ('STOCK_DIFERENTE', 'Stock distinto entre INVEN03 e INVEN08'), ('FECHA_CORREGIDA', 'Fecha corregida por bug de año de 2 dígitos'), ('FECHA_INVALIDA', 'Fecha inválida o fuera de rango'), ('MONTO_INVALIDO', 'Monto o moneda ambigua'), ('CODIGO_DUPLICADO', 'Código duplicado'), ('DATO_ILEGIBLE', 'Dato ilegible por codificación o corrupción'), ('RELACION_INCOMPLETA', 'Relación incompleta'), ('UBICACION_NO_CONFIRMADA', 'Ubicación de baja confianza, asignada a SINUB'), ('UBICACION_NO_DETECTADA', 'Sin ubicación detectable en el nombre, asignada a SINUB'), ('CONFLICTO_ENTRE_COPIAS', 'Mismo código con datos distintos entre bases1 y raíz'), ('AJUSTE_CONCILIACION', 'Ajuste de stock por conciliación final contra INVEN08'), ('OTRO', 'Otro')], max_length=30)),
                ('source_table', models.CharField(blank=True, choices=[('INVEN01', 'Proveedores'), ('INVEN03', 'Piezas / productos'), ('INVEN05', 'Compras / facturas'), ('INVEN08', 'Stock auxiliar')], max_length=10)),
                ('source_key', models.CharField(blank=True, max_length=100)),
                ('message', models.TextField()),
                ('context', models.JSONField(blank=True, default=dict, help_text='Datos estructurados adicionales (valores comparados, etc.).')),
                ('run', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='issues', to='legacy_migration.migrationrun')),
            ],
            options={
                'verbose_name': 'Inconsistencia de migración',
                'verbose_name_plural': 'Inconsistencias de migración',
                'db_table': 'legacy_migration_issues',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='LegacyRecordMap',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('source_table', models.CharField(choices=[('INVEN01', 'Proveedores'), ('INVEN03', 'Piezas / productos'), ('INVEN05', 'Compras / facturas'), ('INVEN08', 'Stock auxiliar')], max_length=10)),
                ('source_key', models.CharField(max_length=100)),
                ('target_model', models.CharField(help_text='Ej. "inventory.Supplier", "inventory.Product".', max_length=100)),
                ('target_id', models.PositiveIntegerField()),
                ('run', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='record_maps', to='legacy_migration.migrationrun')),
            ],
            options={
                'verbose_name': 'Mapa de registro legacy',
                'verbose_name_plural': 'Mapas de registros legacy',
                'db_table': 'legacy_migration_record_maps',
                'ordering': ['source_table', 'source_key'],
            },
        ),
        migrations.AddIndex(
            model_name='legacystagingrecord',
            index=models.Index(fields=['source_table', 'source_key'], name='legacy_staging_source_idx'),
        ),
        migrations.AddIndex(
            model_name='legacyrecordmap',
            index=models.Index(fields=['target_model', 'target_id'], name='legacy_record_map_target_idx'),
        ),
        migrations.AddConstraint(
            model_name='legacyrecordmap',
            constraint=models.UniqueConstraint(fields=('source_table', 'source_key', 'target_model'), name='uq_legacy_record_map_source'),
        ),
    ]
