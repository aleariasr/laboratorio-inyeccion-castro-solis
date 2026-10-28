from rest_framework.exceptions import ValidationError


def lock_document(model, pk, *, editable_statuses, message):
    """
    Bloquea la fila del documento (SELECT … FOR UPDATE) hasta el fin de
    la transacción y la devuelve recién leída. Si ya no está en un estado
    editable, corta con `message` (400, en "detail").

    Toda escritura sobre un documento con estado (encabezado o líneas)
    pasa por aquí, igual que confirmar, aprobar, entregar o anular. Así dos
    escrituras sobre el mismo documento quedan en fila: la segunda espera
    a la primera y ve su resultado. Sin esto (pasada previa a la 2.5.0,
    2026-10-27), guardar una venta mientras se confirmaba escribía la copia
    vieja y la venta volvía a borrador con el stock ya descontado, y una
    línea agregada mientras se aprobaba un conteo quedaba sin ajuste.

    Debe llamarse dentro de transaction.atomic.
    """

    document = model.objects.select_for_update().get(pk=pk)

    if document.status not in editable_statuses:
        raise ValidationError({"detail": message})

    return document
