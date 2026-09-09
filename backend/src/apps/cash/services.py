from datetime import timedelta

from django.db import transaction

from apps.cash.exceptions import (
    CashClosingAlreadyExistsError,
    DifferenceReasonRequiredError,
    InvalidWeekStartError,
)
from apps.cash.models import CashClosing
from apps.cash.selectors import expected_cash_total

SATURDAY = 5  # Python: Monday=0 ... Saturday=5, Sunday=6


@transaction.atomic
def create_cash_closing(
    *,
    week_start,
    counted_cash_total,
    difference_reason,
    notes,
    user,
):
    if week_start.weekday() != SATURDAY:
        raise InvalidWeekStartError(
            "La semana de un cierre de caja debe iniciar un sábado."
        )

    week_end = week_start + timedelta(days=6)

    if CashClosing.objects.filter(week_start=week_start).exists():
        raise CashClosingAlreadyExistsError(
            "Ya existe un cierre de caja para esta semana."
        )

    expected = expected_cash_total(week_start, week_end)
    difference = counted_cash_total - expected

    normalized_reason = (difference_reason or "").strip()

    if difference != 0 and not normalized_reason:
        raise DifferenceReasonRequiredError(
            "Debe indicar el motivo de la diferencia entre lo esperado y lo contado."
        )

    return CashClosing.objects.create(
        week_start=week_start,
        week_end=week_end,
        expected_cash_total=expected,
        counted_cash_total=counted_cash_total,
        difference=difference,
        difference_reason=normalized_reason,
        notes=(notes or "").strip(),
        created_by=user,
        updated_by=user,
    )
