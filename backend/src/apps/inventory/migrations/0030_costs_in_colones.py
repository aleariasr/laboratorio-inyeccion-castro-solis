"""
Costos y precio sugerido en colones (auditoría de compras en dólares,
2026-11-07).

1. ImportCost.exchange_rate pasa a significar siempre "colones por dólar
   con que se pagó el costo" (1 si el costo es en colones). Antes
   dependía de la moneda de la compra: 1 si coincidía con la del costo, y
   el tipo de cambio si no. Se reescriben los valores guardados:
   - costo en colones → 1 (en una compra en dólares tenía el tipo de
     cambio para pasarlo a dólares);
   - costo en dólares de una compra en dólares → el tipo de cambio de la
     compra (tenía 1, "el mismo de la compra");
   - costo en dólares de una compra en colones → sin cambio (ya era ₡/US$).

2. ProductCostHistory.final_unit_cost y suggested_price pasan a guardarse
   en colones. Los cálculos de compras en dólares se multiplican por el
   tipo de cambio que el propio cálculo copió de la compra, que es
   exactamente la conversión que hacía el selector de precio al vuelo:
   el precio de venta de cada producto queda igual que antes.
   original_unit_cost sigue en la moneda de la compra.

Los cálculos o compras en dólares con un tipo de cambio que no es real
(el 1 que dejaba el formulario) no se pueden corregir aquí porque no se
sabe el valor bueno: se listan y corrigen con
`manage.py fix_purchase_exchange_rate`.
"""

from decimal import Decimal, ROUND_HALF_UP

from django.core.validators import MinValueValidator
from django.db import migrations, models

AMOUNT_QUANTUM = Decimal("0.0001")


def _money(value):
    return value.quantize(AMOUNT_QUANTUM, rounding=ROUND_HALF_UP)


def forwards(apps, schema_editor):
    ImportCost = apps.get_model("inventory", "ImportCost")
    ProductCostHistory = apps.get_model("inventory", "ProductCostHistory")

    for cost in ImportCost.objects.select_related("purchase"):
        if cost.currency == "CRC":
            new_rate = Decimal("1")
        elif cost.purchase.currency == "USD":
            new_rate = cost.purchase.exchange_rate
        else:
            continue

        if cost.exchange_rate != new_rate:
            cost.exchange_rate = new_rate
            cost.save(update_fields=["exchange_rate"])

    for history in ProductCostHistory.objects.filter(currency="USD"):
        rate = history.exchange_rate
        history.final_unit_cost = _money(history.final_unit_cost * rate)

        if history.suggested_price is not None:
            history.suggested_price = _money(history.suggested_price * rate)

        history.save(update_fields=["final_unit_cost", "suggested_price"])


def backwards(apps, schema_editor):
    ImportCost = apps.get_model("inventory", "ImportCost")
    ProductCostHistory = apps.get_model("inventory", "ProductCostHistory")

    for cost in ImportCost.objects.select_related("purchase"):
        if cost.purchase.currency == "USD":
            new_rate = (
                Decimal("1")
                if cost.currency == "USD"
                else cost.purchase.exchange_rate
            )
        else:
            continue

        if cost.exchange_rate != new_rate:
            cost.exchange_rate = new_rate
            cost.save(update_fields=["exchange_rate"])

    for history in ProductCostHistory.objects.filter(currency="USD"):
        rate = history.exchange_rate
        history.final_unit_cost = _money(history.final_unit_cost / rate)

        if history.suggested_price is not None:
            history.suggested_price = _money(history.suggested_price / rate)

        history.save(update_fields=["final_unit_cost", "suggested_price"])


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0029_default_branch"),
    ]

    operations = [
        migrations.AlterField(
            model_name="importcost",
            name="exchange_rate",
            field=models.DecimalField(
                decimal_places=4,
                default=1,
                help_text=(
                    "Colones por dólar con que se pagó el costo. "
                    "1 si el costo es en colones."
                ),
                max_digits=12,
                validators=[MinValueValidator(Decimal("0.0001"))],
            ),
        ),
        migrations.AlterField(
            model_name="productcosthistory",
            name="final_unit_cost",
            field=models.DecimalField(
                decimal_places=4,
                help_text="En colones, con los costos de importación prorrateados.",
                max_digits=12,
                validators=[MinValueValidator(Decimal("0.0001"))],
            ),
        ),
        migrations.AlterField(
            model_name="productcosthistory",
            name="suggested_price",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                help_text="Precio de venta sugerido, en colones.",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.RunPython(forwards, backwards),
    ]
