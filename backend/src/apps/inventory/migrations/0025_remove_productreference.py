from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0024_migrate_product_references_to_products'),
    ]

    operations = [
        migrations.DeleteModel(
            name='ProductReference',
        ),
    ]
