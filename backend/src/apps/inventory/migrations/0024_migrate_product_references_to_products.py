from django.db import migrations


def migrate_references_to_products(apps, schema_editor):
    """
    §3.6 — ProductReference era metadata pura (sin precio ni stock ni
    ubicación propia). Cada fila se convierte en un Product real
    (variante GENERIC), compartiendo standard_code y storage_location
    con su producto padre, sin precio ni stock inicial (no hay datos
    de precio/stock que migrar desde ProductReference).
    """
    Product = apps.get_model('inventory', 'Product')
    ProductReference = apps.get_model('inventory', 'ProductReference')

    for reference in ProductReference.objects.select_related('product').all():
        parent = reference.product

        if reference.manufacturer:
            name = f"{parent.name} ({reference.manufacturer})"
        else:
            name = f"{parent.name} (ref. {reference.reference_code})"

        Product.objects.create(
            standard_code=parent.standard_code,
            name=name,
            description=reference.description,
            storage_location=parent.storage_location,
            minimum_stock=0,
            unit_of_measure=parent.unit_of_measure,
            variant_kind='GENERIC',
            is_active=reference.is_active,
            created_by=reference.created_by,
            updated_by=reference.updated_by,
        )


def noop_reverse(apps, schema_editor):
    """
    No reversible: no hay forma de distinguir, entre los Product
    resultantes, cuáles vinieron de esta migración de los creados a
    mano después. Datos de desarrollo sin valor de producción.
    """


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0023_product_variant_kind_and_relax_code'),
    ]

    operations = [
        migrations.RunPython(
            migrate_references_to_products,
            noop_reverse,
        ),
    ]
