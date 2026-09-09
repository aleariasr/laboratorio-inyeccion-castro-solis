from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0022_product_custom_sale_price'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='variant_kind',
            field=models.CharField(
                choices=[
                    ('ORIGINAL', 'Original'),
                    ('GENERIC', 'Genérico'),
                    ('OTHER', 'Otro'),
                ],
                default='ORIGINAL',
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name='product',
            name='standard_code',
            field=models.CharField(
                db_index=True,
                help_text=(
                    'Código estándar de la pieza ("código universal"). '
                    'Varias filas Product pueden compartir el mismo código '
                    'para representar distintas variantes (original, '
                    'genérico, etc.) de la misma pieza.'
                ),
                max_length=50,
            ),
        ),
    ]
