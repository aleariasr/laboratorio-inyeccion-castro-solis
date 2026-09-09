from datetime import timedelta

from django.db import transaction

from apps.cash.exceptions import (
    CashClosingAlreadyExistsError,
    DifferenceReasonRequiredError,
    InvalidWeekStartError,
)
from apps.cash.models import CashClosing
from apps.cash.selectors import expected_totals_by_method
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

    breakdown = expected_totals_by_method(week_start, week_end)
    expected = sum(breakdown.values())
    difference = counted_total - expected

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
        counted_total=counted_total,
        difference=difference,
        difference_reason=normalized_reason,
        notes=(notes or "").strip(),
        created_by=user,
        updated_by=user,
    )
