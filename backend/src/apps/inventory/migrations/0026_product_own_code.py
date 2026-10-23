from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Punto 16: código propio de un producto, además del universal. Columna
    nueva con "" para los productos existentes y un índice único parcial
    (solo sobre los que tienen valor). Aditiva: no cambia ningún dato.
    """

    dependencies = [
        ("inventory", "0025_remove_productreference"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="own_code",
            field=models.CharField(
                blank=True,
                default="",
                help_text=(
                    "Código propio de la pieza, además del código universal "
                    "(por ejemplo, el del fabricante de un genérico). Opcional; "
                    "si tiene valor, no se repite entre productos."
                ),
                max_length=50,
            ),
        ),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.UniqueConstraint(
                condition=models.Q(("own_code", ""), _negated=True),
                fields=("own_code",),
                name="inventory_product_unique_own_code",
            ),
        ),
    ]
