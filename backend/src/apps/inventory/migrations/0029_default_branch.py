from django.db import migrations

DEFAULT_BRANCH_NAME = "Otra sede"


def create_default_branch(apps, schema_editor):
    Branch = apps.get_model("inventory", "Branch")

    Branch.objects.get_or_create(name=DEFAULT_BRANCH_NAME)


def delete_default_branch(apps, schema_editor):
    Branch = apps.get_model("inventory", "Branch")

    # Solo si nunca se usó: un traslado la protege (PROTECT).
    Branch.objects.filter(
        name=DEFAULT_BRANCH_NAME,
        stock_transfers__isnull=True,
    ).delete()


class Migration(migrations.Migration):
    """
    Punto 6 del plan del 2026-10-22: deja creada la sede "Otra sede" para
    que el primer traslado ya tenga destino. Se renombra desde el panel
    de administración. Aditiva: solo agrega esa fila.
    """

    dependencies = [
        ("inventory", "0028_stock_transfers"),
    ]

    operations = [
        migrations.RunPython(
            create_default_branch,
            delete_default_branch,
        ),
    ]
