from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0005_alter_customer_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='injectorservicerecord',
            name='inductance',
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=8, null=True),
        ),
        migrations.AddField(
            model_name='injectorservicerecord',
            name='isolation',
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=8, null=True),
        ),
    ]
