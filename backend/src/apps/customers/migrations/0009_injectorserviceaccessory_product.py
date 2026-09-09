import django.db.models.deletion
from django.db import migrations, models


def delete_existing_service_accessories(apps, schema_editor):
    InjectorServiceAccessory = apps.get_model("customers", "InjectorServiceAccessory")
    InjectorServiceAccessory.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0008_servicetype_servicetypepricehistory'),
        ('inventory', '0020_alter_storagelocation_code'),
    ]

    operations = [
        migrations.RunPython(
            delete_existing_service_accessories,
            migrations.RunPython.noop,
        ),
        migrations.RemoveConstraint(
            model_name='injectorserviceaccessory',
            name='uq_service_accessory',
        ),
        migrations.RemoveField(
            model_name='injectorserviceaccessory',
            name='accessory',
        ),
        migrations.AddField(
            model_name='injectorserviceaccessory',
            name='product',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='service_accessories', to='inventory.product'),
        ),
        migrations.AddConstraint(
            model_name='injectorserviceaccessory',
            constraint=models.UniqueConstraint(fields=('service_record', 'product'), name='uq_service_accessory'),
        ),
        migrations.DeleteModel(
            name='InjectorAccessory',
        ),
    ]
