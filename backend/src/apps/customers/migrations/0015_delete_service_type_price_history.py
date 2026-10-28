from django.db import migrations


class Migration(migrations.Migration):
    """
    Se borra el histórico de precios por tipo de servicio (decisión del
    2026-10-27, versión 2.5.0). Guardaba el total de cada servicio, con los
    accesorios incluidos, como si fuera el precio del tipo: era la causa del
    precio que se acumulaba (punto 3 del plan del 2026-10-22). Desde el
    3 + 1B no se escribe ni se lee; el precio de referencia es el de mano de
    obra de cada tipo.

    Destructiva solo para esa tabla: borra sus filas. No toca servicios,
    líneas de cobro, accesorios, tipos de servicio ni montos cobrados (lo
    cobrado en cada servicio sigue en el propio servicio).
    """

    dependencies = [
        ("customers", "0014_remove_service_type_kit"),
    ]

    operations = [
        migrations.DeleteModel(
            name="ServiceTypePriceHistory",
        ),
    ]
