import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Punto 6 del plan del 2026-10-22: traslados a otra sede.

    - Tablas nuevas: sedes, traslados y líneas de traslado.
    - Movimientos: tipo nuevo TRANSFER_OUT ("Traslado a sede") y una FK
      nueva y vacía (nullable) a la línea de traslado.

    Aditiva: no cambia ni borra ningún dato existente.
    """

    dependencies = [
        ("inventory", "0027_natural_collation"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Branch",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("name", models.CharField(max_length=100, unique=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="%(class)s_created", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="%(class)s_updated", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Sede",
                "verbose_name_plural": "Sedes",
                "db_table": "inventory_branches",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="StockTransfer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("transfer_date", models.DateField()),
                ("status", models.CharField(choices=[("DRAFT", "Borrador"), ("CONFIRMED", "Confirmado"), ("CANCELLED", "Anulado")], default="DRAFT", max_length=15)),
                ("notes", models.TextField(blank=True)),
                ("confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("cancelled_at", models.DateTimeField(blank=True, null=True)),
                ("cancellation_reason", models.TextField(blank=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="stock_transfers", to="inventory.branch")),
                ("cancelled_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="cancelled_stock_transfers", to=settings.AUTH_USER_MODEL)),
                ("confirmed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="confirmed_stock_transfers", to=settings.AUTH_USER_MODEL)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="%(class)s_created", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="%(class)s_updated", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Traslado",
                "verbose_name_plural": "Traslados",
                "db_table": "inventory_stock_transfers",
                "ordering": ["-transfer_date", "-id"],
            },
        ),
        migrations.CreateModel(
            name="StockTransferItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("quantity", models.PositiveIntegerField(validators=[django.core.validators.MinValueValidator(1)])),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="%(class)s_created", to=settings.AUTH_USER_MODEL)),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="stock_transfer_items", to="inventory.product")),
                ("stock_transfer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="inventory.stocktransfer")),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="%(class)s_updated", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Línea de traslado",
                "verbose_name_plural": "Líneas de traslado",
                "db_table": "inventory_stock_transfer_items",
                "constraints": [models.UniqueConstraint(fields=("stock_transfer", "product"), name="uq_stock_transfer_product")],
            },
        ),
        migrations.AddField(
            model_name="stockmovement",
            name="stock_transfer_item",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="stock_movements", to="inventory.stocktransferitem"),
        ),
        migrations.AlterField(
            model_name="stockmovement",
            name="movement_type",
            field=models.CharField(choices=[("ENTRY", "Entrada"), ("EXIT", "Salida"), ("ADJUSTMENT", "Ajuste"), ("INITIAL", "Inventario inicial"), ("REVERSAL", "Reversión"), ("SERVICE_USE", "Uso en servicio"), ("TRANSFER_OUT", "Traslado a sede")], max_length=20),
        ),
    ]
