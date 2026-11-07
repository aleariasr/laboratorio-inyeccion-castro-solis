"""
PDF de un cierre de caja (puntos 2 + 27): lo mismo que el detalle del
cierre, para archivarlo en papel, con el recuadro de revisión al pie.
"""

from apps.cash.models import PettyCashMovement
from apps.cash.serializers import (
    business_income,
    cash_withdrawal,
    expected_physical_total,
    petty_cash_fund_balance,
    petty_cash_overdraft,
)
from apps.documents.report_pdf import (
    Column,
    KeyValues,
    Table,
    TextBlock,
    build_report_pdf,
    format_amount,
    format_crc,
    format_date,
    format_datetime,
)


def _user_name(user):
    if user is None:
        return "—"

    return user.get_full_name() or user.get_username()


def _signed_crc(value):
    if value > 0:
        return f"+{format_crc(value)}"

    if value < 0:
        return f"-{format_crc(abs(value))}"

    return format_crc(value)


def _unsigned_if_positive_crc(value):
    return _signed_crc(value) if value < 0 else format_crc(value)


def build_cash_closing_pdf(*, closing):
    movements = list(
        PettyCashMovement.objects.select_related("created_by").filter(
            date__gte=closing.week_start,
            date__lte=closing.week_end,
        ).order_by("date", "id")
    )

    fund_balance = petty_cash_fund_balance(
        closing.petty_cash_opening,
        closing.petty_cash_outflows,
    )
    overdraft = petty_cash_overdraft(
        closing.petty_cash_opening,
        closing.petty_cash_outflows,
    )

    withdrawal = cash_withdrawal(
        closing.counted_total,
        closing.next_petty_cash_opening,
    )

    petty_cash_rows = [
        ("Fondo al inicio", format_crc(closing.petty_cash_opening)),
        ("Gastos", f"-{format_crc(closing.petty_cash_outflows)}"),
        ("Saldo del fondo", format_crc(fund_balance), True),
    ]

    # Sobregiro: lo que superó el fondo se pagó con los ingresos.
    if overdraft > 0:
        petty_cash_rows.append(
            ("Pagado con ingresos (sobregiro)", format_crc(overdraft)),
        )

    blocks = [
        KeyValues(
            title="Cobrado en la semana",
            rows=[
                ("Efectivo", format_crc(closing.expected_cash)),
                ("Tarjeta", format_crc(closing.expected_card)),
                ("Transferencia", format_crc(closing.expected_transfer)),
                ("Otro", format_crc(closing.expected_other)),
                ("Total cobrado", format_crc(closing.expected_total), True),
            ],
        ),
        KeyValues(
            title="De ese dinero",
            rows=[
                (
                    "Impuestos cobrados (corresponden a Hacienda)",
                    format_crc(closing.expected_tax),
                ),
                (
                    "Ingreso del negocio",
                    format_crc(
                        business_income(
                            closing.expected_total,
                            closing.expected_tax,
                        )
                    ),
                    True,
                ),
                (
                    "Descuentos dados (ya restados del total)",
                    format_crc(closing.expected_discount),
                ),
            ],
        ),
        KeyValues(
            title="Caja chica",
            rows=petty_cash_rows,
        ),
    ]

    if movements:
        blocks.append(
            Table(
                title="Gastos de la semana",
                columns=(
                    Column("Fecha", 1.1),
                    Column("Motivo", 3.6),
                    Column("Registró", 1.5),
                    Column("Monto (CRC)", 1.3, align="right"),
                ),
                rows=[
                    (
                        format_date(movement.date),
                        movement.reason,
                        _user_name(movement.created_by),
                        format_amount(movement.amount),
                    )
                    for movement in movements
                ],
                totals=(
                    "",
                    "Total",
                    "",
                    format_amount(closing.petty_cash_outflows),
                ),
            )
        )

    blocks.append(
        KeyValues(
            title="Conteo",
            rows=[
                (
                    "Debía haber (cobrado + fondo - gastos)",
                    format_crc(
                        expected_physical_total(
                            closing.expected_total,
                            closing.petty_cash_opening,
                            closing.petty_cash_outflows,
                        )
                    ),
                ),
                ("Contado", format_crc(closing.counted_total)),
                ("Diferencia", _signed_crc(closing.difference), True),
                (
                    "Fondo de caja chica para la semana siguiente",
                    format_crc(closing.next_petty_cash_opening),
                ),
                (
                    "Se retira de la caja (contado - fondo siguiente, "
                    "con vouchers y comprobantes)",
                    _unsigned_if_positive_crc(withdrawal),
                ),
            ],
        )
    )

    if closing.difference_reason:
        blocks.append(
            TextBlock(
                title="Motivo de la diferencia",
                text=closing.difference_reason,
            )
        )

    if closing.notes:
        blocks.append(TextBlock(title="Notas", text=closing.notes))

    return build_report_pdf(
        banner_title="CIERRE DE CAJA",
        title=(
            f"Semana del {format_date(closing.week_start)} "
            f"al {format_date(closing.week_end)}"
        ),
        subtitle_lines=[
            "Sábado a viernes. Cerrado por "
            f"{_user_name(closing.created_by)} el "
            f"{format_datetime(closing.created_at)}.",
        ],
        blocks=blocks,
    )
