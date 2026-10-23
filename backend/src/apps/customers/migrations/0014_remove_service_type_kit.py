from django.db import migrations


class Migration(migrations.Migration):
    """
    Se quita el kit de accesorios del tipo de servicio (plan del
    2026-10-22, revisión del 1A): proponía descontar inventario por
    suposición y era fácil descuadrar el stock. Los accesorios se agregan a
    mano, con lo que de verdad se usó.

    Destructiva solo para el kit: borra la tabla de "accesorios que suele
    llevar" de cada tipo (lista de referencia, sin movimientos de
    inventario). No toca servicios, accesorios usados, inventario ni
    precios.
    """

    dependencies = [
        ("customers", "0013_service_charge_lines"),
    ]

    operations = [
        migrations.DeleteModel(
            name="ServiceTypeAccessory",
        ),
    ]
