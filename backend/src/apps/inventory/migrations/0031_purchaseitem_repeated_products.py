"""
Un mismo producto puede venir en varias líneas de una factura (pedido del
cliente del 2026-11-10: mercadería del mismo proveedor despachada desde dos
bodegas, a precios distintos).

- Quita la restricción única (compra, producto del proveedor).
- Agrega `reference`, un texto opcional para distinguir esas líneas.

Aditiva: no cambia ningún dato existente. Volver atrás solo falla si ya hay
facturas con un producto repetido.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0030_costs_in_colones"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="purchaseitem",
            name="uq_purchase_supplier_product",
        ),
        migrations.AddField(
            model_name="purchaseitem",
            name="reference",
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
