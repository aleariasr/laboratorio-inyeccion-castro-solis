"""
Resumen de ventas (punto 20): reemplaza al reporte "Ventas por fecha".

Por período (día, semana de caja sábado a viernes, o mes) y para el rango
completo: cantidad de documentos, subtotal, descuentos, impuestos, total,
ingreso del negocio (total − impuestos) y total por método de pago, en
tres bloques — ventas, servicios y el total del negocio. Opcionalmente
compara contra otro rango y devuelve la variación.

Cuenta exactamente lo mismo que el cierre de caja: ventas confirmadas y
activas por su fecha, servicios entregados y activos por la fecha de
entrega, con los montos cobrados (descuento e impuesto incluidos).
"""

import calendar
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cash.selectors import week_start_for
from apps.core.models import PaymentMethod
from apps.core.permissions import ReportsPermission
from apps.core.query_params import parse_date_or_none
from apps.customers.selectors import delivered_services, service_amounts
from apps.sales.selectors import confirmed_sales, sale_amounts

GROUP_BY_VALUES = ("day", "week", "month")

BLOCKS = ("sales", "services", "total")

# Campos que se comparan entre períodos (la variación).
COMPARED_FIELDS = (
    "count",
    "subtotal",
    "discount",
    "tax",
    "total",
    "business_income",
)

ZERO = Decimal("0")


def _empty_block():
    return {
        "count": 0,
        "subtotal": ZERO,
        "discount": ZERO,
        "tax": ZERO,
        "total": ZERO,
        "business_income": ZERO,
        "by_method": {method: ZERO for method in PaymentMethod.values},
    }


def _empty_group():
    return {block: _empty_block() for block in BLOCKS}


def _add(group, block, amounts, payment_method):
    for target in (group[block], group["total"]):
        target["count"] += 1
        target["subtotal"] += amounts.subtotal
        target["discount"] += amounts.discount_amount
        target["tax"] += amounts.tax_amount
        target["total"] += amounts.total
        target["business_income"] += amounts.total - amounts.tax_amount
        target["by_method"][payment_method] += amounts.total


def _period_bounds(day, group_by):
    if group_by == "day":
        return day, day

    if group_by == "week":
        start = week_start_for(day)
        return start, start + timedelta(days=6)

    start = day.replace(day=1)
    last_day = calendar.monthrange(day.year, day.month)[1]
    return start, day.replace(day=last_day)


def _collect(date_from, date_to, group_by=None):
    """
    Recorre las ventas y servicios del rango una vez. Devuelve el total
    del rango y, si se pide group_by, los períodos con movimiento.
    """

    summary = _empty_group()
    periods = {}

    def add(day, block, amounts, payment_method):
        _add(summary, block, amounts, payment_method)

        if group_by is not None:
            bounds = _period_bounds(day, group_by)
            group = periods.setdefault(bounds, _empty_group())
            _add(group, block, amounts, payment_method)

    for sale in confirmed_sales().filter(
        sale_date__gte=date_from,
        sale_date__lte=date_to,
    ):
        add(sale.sale_date, "sales", sale_amounts(sale), sale.payment_method)

    for service_record in delivered_services().filter(
        delivered_at__date__gte=date_from,
        delivered_at__date__lte=date_to,
    ):
        amounts = service_amounts(service_record)

        # Un servicio entregado siempre tiene precio (deliver_service lo
        # exige); el chequeo es solo por datos importados.
        if amounts is None:
            continue

        add(
            timezone.localtime(service_record.delivered_at).date(),
            "services",
            amounts,
            service_record.payment_method,
        )

    period_list = [
        {"period_start": start, "period_end": end, **group}
        for (start, end), group in sorted(periods.items())
    ]

    return summary, period_list


def _variation(current, previous):
    variation = {}

    for block in BLOCKS:
        variation[block] = {}

        for field in COMPARED_FIELDS:
            now = current[block][field]
            before = previous[block][field]
            difference = now - before

            # Sin base no hay porcentaje (crecer desde 0 no es un %).
            percentage = (
                (Decimal(difference) / Decimal(before) * 100).quantize(
                    Decimal("0.1"),
                    rounding=ROUND_HALF_UP,
                )
                if before
                else None
            )

            variation[block][field] = {
                "amount": difference,
                "percentage": percentage,
            }

    return variation


def _parse_range(request, from_name, to_name, *, required):
    from_value = request.query_params.get(from_name)
    to_value = request.query_params.get(to_name)

    if not from_value and not to_value and not required:
        return None, None, None

    if not from_value or not to_value:
        return None, None, (
            f"{from_name} y {to_name} son obligatorios (formato AAAA-MM-DD)."
        )

    date_from = parse_date_or_none(from_value)
    date_to = parse_date_or_none(to_value)

    if date_from is None or date_to is None:
        return None, None, (
            f"{from_name} y {to_name} deben tener formato AAAA-MM-DD."
        )

    if date_from > date_to:
        return None, None, (
            f"{from_name} no puede ser mayor que {to_name}."
        )

    return date_from, date_to, None


def parse_sales_summary_params(request):
    """
    Lee y valida los filtros del resumen. Devuelve (params, None) o
    (None, respuesta 400). Lo comparten la vista JSON y el PDF.
    """

    date_from, date_to, error = _parse_range(
        request,
        "date_from",
        "date_to",
        required=True,
    )

    if error:
        return None, Response(
            {"detail": error},
            status=status.HTTP_400_BAD_REQUEST,
        )

    group_by = request.query_params.get("group_by", "day")

    if group_by not in GROUP_BY_VALUES:
        return None, Response(
            {"detail": "group_by debe ser day, week o month."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    compare_from, compare_to, error = _parse_range(
        request,
        "compare_from",
        "compare_to",
        required=False,
    )

    if error:
        return None, Response(
            {"detail": error},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return {
        "date_from": date_from,
        "date_to": date_to,
        "group_by": group_by,
        "compare_from": compare_from,
        "compare_to": compare_to,
    }, None


def sales_summary_data(params):
    summary, periods = _collect(
        params["date_from"],
        params["date_to"],
        params["group_by"],
    )

    comparison = None

    if params["compare_from"] is not None:
        previous, _periods = _collect(
            params["compare_from"],
            params["compare_to"],
        )
        comparison = {
            "date_from": params["compare_from"],
            "date_to": params["compare_to"],
            "summary": previous,
            "variation": _variation(summary, previous),
        }

    return {
        "date_from": params["date_from"],
        "date_to": params["date_to"],
        "group_by": params["group_by"],
        "periods": periods,
        "summary": summary,
        "comparison": comparison,
    }


class SalesSummaryReportView(APIView):
    permission_classes = [ReportsPermission]

    def get(self, request):
        params, error_response = parse_sales_summary_params(request)

        if error_response is not None:
            return error_response

        return Response(sales_summary_data(params))
