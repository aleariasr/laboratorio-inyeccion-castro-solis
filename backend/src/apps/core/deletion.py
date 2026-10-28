from django.db import transaction
from django.db.models import ProtectedError
from rest_framework.exceptions import ValidationError


class ProtectedDeleteMixin:
    """
    Borrar algo que ya tiene historial (un cliente con ventas, un
    proveedor con compras, un usuario que registró documentos) lo impide
    la base de datos con PROTECT. Antes eso llegaba a la pantalla como
    error 500 (pasada previa a la 2.5.0); ahora es un aviso. Lo que no
    tiene historial se sigue pudiendo borrar.
    """

    protected_delete_message = (
        "No se puede eliminar porque tiene registros asociados; se desactiva."
    )

    def perform_destroy(self, instance):
        try:
            with transaction.atomic():
                instance.delete()
        except ProtectedError:
            raise ValidationError({"detail": self.protected_delete_message})
