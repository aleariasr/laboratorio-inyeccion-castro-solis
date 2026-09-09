from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0018_stockmovement_inventory_count'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='supplierproduct',
            name='uq_supplier_product',
        ),
        migrations.RemoveField(
            model_name='supplierproduct',
            name='supplier_reference',
        ),
        migrations.AddConstraint(
            model_name='supplierproduct',
            constraint=models.UniqueConstraint(fields=('supplier', 'product'), name='uq_supplier_product'),
        ),
    ]
