from apps.customers.models import InjectorServiceRecord


def lock_service_record(service_record_id):
    """
    Bloquea el servicio (SELECT … FOR UPDATE) hasta el fin de la
    transacción y lo devuelve recién leído.

    Todo lo que escribe en un servicio (estado, accesorios, líneas de
    cobro, datos) pasa primero por aquí, así queda en fila con lo demás.
    Sin esto (pasada previa a la 2.5.0, 2026-10-27), un accesorio agregado
    mientras se entregaba el servicio salía del inventario pero no entraba
    en lo cobrado. Debe llamarse dentro de transaction.atomic.
    """

    return InjectorServiceRecord.objects.select_for_update().get(
        pk=service_record_id,
    )
