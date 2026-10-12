from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.cash.exceptions import (
    CashClosingAlreadyExistsError,
    DifferenceReasonRequiredError,
    FuturePettyCashOutflowError,
    FutureWeekClosingError,
    InvalidWeekStartError,
    PettyCashWeekClosedError,
)
from apps.cash.models import CashClosing, PettyCashMovement
from apps.cash.selectors import (
    expected_totals_by_method,
    inherited_petty_cash_opening,
    is_week_closed,
    petty_cash_outflows_total,
    week_tax_and_discount,
)
from apps.core.models import PaymentMethod

SATURDAY = 5  # Python: Monday=0 ... Saturday=5, Sunday=6


@transaction.atomic
def create_cash_closing(
    *,
    week_start,
    counted_total,
    difference_reason,
    notes,
    user,
    petty_cash_opening=None,
    next_petty_cash_opening=None,
):
    if week_start.weekday() != SATURDAY:
        raise InvalidWeekStartError(
            "La semana de un cierre de caja debe iniciar un sábado."
        )

    week_end = week_start + timedelta(days=6)

    # Un cierre no se puede editar ni borrar (ver CashClosing), así que
    # cerrar antes de que termine la semana congelaría un total
    # incompleto para siempre. El viernes mismo sí se permite: es el día
    # en que se cierra.
    if week_end > timezone.localdate():
        raise FutureWeekClosingError(
            "Todavía no se puede cerrar esta semana: el viernes de cierre "
            f"({week_end.isoformat()}) no ha llegado."
        )

    if CashClosing.objects.filter(week_start=week_start).exists():
        raise CashClosingAlreadyExistsError(
            "Ya existe un cierre de caja para esta semana."
        )

    breakdown = expected_totals_by_method(week_start, week_end)
    expected = sum(breakdown.values())
    tax_and_discount = week_tax_and_discount(week_start, week_end)

    # Caja chica (puntos 21 + 22): el fondo se hereda del cierre anterior;
    # solo la primera vez se toma el que se escribe (o 0 si no se indica).
    inherited_opening = inherited_petty_cash_opening(week_start)
    opening = (
        inherited_opening
        if inherited_opening is not None
        else (petty_cash_opening or 0)
    )
    outflows = petty_cash_outflows_total(week_start, week_end)

    # Lo contado incluye el efectivo de caja chica: se compara contra lo
    # cobrado más el saldo del fondo.
    expected_physical = expected + opening - outflows
    difference = counted_total - expected_physical

    normalized_reason = (difference_reason or "").strip()

    if difference != 0 and not normalized_reason:
        raise DifferenceReasonRequiredError(
            "Debe indicar el motivo de la diferencia entre lo esperado y lo contado."
        )

    return CashClosing.objects.create(
        week_start=week_start,
        week_end=week_end,
        expected_total=expected,
        expected_cash=breakdown[PaymentMethod.CASH],
        expected_card=breakdown[PaymentMethod.CARD],
        expected_transfer=breakdown[PaymentMethod.TRANSFER],
        expected_other=breakdown[PaymentMethod.OTHER],
        expected_tax=tax_and_discount["tax"],
        expected_discount=tax_and_discount["discount"],
        petty_cash_opening=opening,
        petty_cash_outflows=outflows,
        # Sin indicar, la semana siguiente arranca con el mismo fondo.
        next_petty_cash_opening=(
            next_petty_cash_opening
            if next_petty_cash_opening is not None
            else opening
        ),
        counted_total=counted_total,
        difference=difference,
        difference_reason=normalized_reason,
        notes=(notes or "").strip(),
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def register_petty_cash_outflow(*, date, amount, reason, user):
    """
    Salida de caja chica (puntos 21 + 22). No se registran salidas en el
    futuro ni en una semana ya cerrada: el cierre ya fijó sus montos.
    """

    if date > timezone.localdate():
        raise FuturePettyCashOutflowError(
            "La fecha de la salida no puede ser futura."
        )

    if is_week_closed(date):
        raise PettyCashWeekClosedError(
            "La semana de esa fecha ya tiene cierre de caja: no se pueden "
            "registrar salidas en ella."
        )

    return PettyCashMovement.objects.create(
        date=date,
        amount=amount,
        reason=reason.strip(),
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def delete_petty_cash_outflow(*, movement):
    if is_week_closed(movement.date):
        raise PettyCashWeekClosedError(
            "La semana de esta salida ya tiene cierre de caja: no se puede "
            "borrar."
        )

    movement.delete()
