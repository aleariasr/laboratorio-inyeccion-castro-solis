from django.contrib.postgres.operations import CreateCollation
from django.db import migrations


class Migration(migrations.Migration):
    """
    Punto 2 del plan del 2026-10-22: orden natural al ordenar productos
    ("A2" antes que "A10"). Crea en Postgres la colación ICU
    `lics_natural` (español, con los números comparados como números),
    que se usa solo al ordenar (`Collate` en la consulta).

    Aditiva: no cambia ninguna tabla, columna ni dato.
    """

    dependencies = [
        ("inventory", "0026_product_own_code"),
    ]

    operations = [
        CreateCollation(
            "lics_natural",
            provider="icu",
            locale="es-u-kn-true",
        ),
    ]
