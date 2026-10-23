import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


def move_price_to_a_charge_line(apps, schema_editor):
    """
    Cada servicio que ya tenía precio queda con UNA línea de cobro por ese
    mismo precio, y sus accesorios en ₡0. Así price (= líneas + accesorios)
    no cambia en ningún servicio, y los montos congelados de los entregados
    tampoco: no se adivina cuánto de ese precio era mano de obra.
    """

    InjectorServiceRecord = apps.get_model("customers", "InjectorServiceRecord")
    ServiceChargeLine = apps.get_model("customers", "ServiceChargeLine")

    lines = []

    for record in InjectorServiceRecord.objects.filter(
        price__isnull=False,
    ).select_related("service_type"):
        lines.append(
            ServiceChargeLine(
                service_record=record,
                service_type=record.service_type,
                description=(
                    record.service_type.name
                    if record.service_type is not None
                    else "Servicio"
                ),
                quantity=1,
                unit_price=record.price,
                created_by_id=record.updated_by_id,
                updated_by_id=record.updated_by_id,
            )
        )

    ServiceChargeLine.objects.bulk_create(lines)


def remove_migrated_charge_lines(apps, schema_editor):
    ServiceChargeLine = apps.get_model("customers", "ServiceChargeLine")
    ServiceChargeLine.objects.all().delete()


class Migration(migrations.Migration):
    """
    Punto 3 + 1B del plan del 2026-10-22: cobro por líneas.

    - Tabla nueva de líneas de cobro del servicio.
    - Precio fijo por unidad en cada accesorio (0 en los existentes).
    - Datos: cada servicio con precio pasa a tener una línea con ese
      precio (ver move_price_to_a_charge_line). No cambia ningún monto.
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("customers", "0012_service_type_labor_price_and_kit"),
    ]

    operations = [
        migrations.AddField(
            model_name="injectorserviceaccessory",
            name="unit_price",
            field=models.DecimalField(
                decimal_places=4,
                default=0,
                max_digits=12,
                validators=[django.core.validators.MinValueValidator(Decimal("0"))],
            ),
        ),
        migrations.CreateModel(
            name="ServiceChargeLine",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("description", models.CharField(max_length=255)),
                (
                    "quantity",
                    models.PositiveIntegerField(
                        default=1,
                        validators=[django.core.validators.MinValueValidator(1)],
                    ),
                ),
                (
                    "unit_price",
                    models.DecimalField(
                        decimal_places=4,
                        max_digits=12,
                        validators=[
                            django.core.validators.MinValueValidator(Decimal("0")),
                        ],
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(class)s_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "service_record",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="charge_lines",
                        to="customers.injectorservicerecord",
                    ),
                ),
                (
                    "service_type",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="charge_lines",
                        to="customers.servicetype",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(class)s_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Línea de cobro de servicio",
                "verbose_name_plural": "Líneas de cobro de servicio",
                "db_table": "customers_service_charge_lines",
                "ordering": ["id"],
            },
        ),
        migrations.RunPython(
            move_price_to_a_charge_line,
            remove_migrated_charge_lines,
        ),
    ]
