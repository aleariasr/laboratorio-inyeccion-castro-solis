from datetime import timedelta
from decimal import Decimal

from django.db.models import DecimalField, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.core.models import PaymentMethod
from apps.customers.models import InjectorServiceRecord, InjectorServiceStatus
from apps.customers.selectors import delivered_services
from apps.sales.models import SaleItem, SaleStatus
from apps.sales.selectors import confirmed_sales, sale_amounts

from .models import CashClosing, PettyCashMovement

MONEY_FIELD = DecimalField(max_digits=14, decimal_places=4)

FRIDAY = 4  # Python: Monday=0 ... Friday=4, Saturday=5
SATURDAY = 5

# Cuántas semanas hacia atrás ofrece la lista de semanas por cerrar.
WEEKS_PENDING_LOOKBACK = 26


def _week_sales(week_start, week_end):
    """Ventas que entran en la caja de la semana (ver confirmed_sales)."""

    return confirmed_sales().filter(
        sale_date__gte=week_start,
        sale_date__lte=week_end,
    )


def _week_services(week_start, week_end):
    """Servicios que entran en la caja de la semana (ver delivered_services)."""

    return delivered_services().filter(
        delivered_at__date__gte=week_start,
        delivered_at__date__lte=week_end,
    )


def _sum(queryset, expression):
    return queryset.aggregate(
        total=Coalesce(Sum(expression), 0, output_field=MONEY_FIELD),
    )["total"]


def sales_total_by_method(week_start, week_end, payment_method):
    # total_amount es lo que se cobró: líneas, menos el descuento, más
    # el impuesto, congelado al confirmar (punto 19).
    sales = _week_sales(week_start, week_end).filter(
        payment_method=payment_method,
    )

    frozen_total = _sum(sales, "total_amount")

    # Red de seguridad, mismo criterio que los servicios: una venta
    # confirmada sin montos congelados (confirmada por fuera de
    # confirm_sale) se calcula como la factura y los reportes, en vez de
    # contar 0 sin aviso.
    unfrozen_total = sum(
        (
            sale_amounts(sale).total
            for sale in sales.filter(total_amount__isnull=True)
        ),
        Decimal("0"),
    )

    return frozen_total + unfrozen_total


def services_total_by_method(week_start, week_end, payment_method):
    # total_amount es lo cobrado (precio − descuento + impuesto),
    # congelado al entregar (punto 26). Un servicio entregado sin montos
    # congelados es anterior a ese cambio: ahí price ya era el total.
    return _sum(
        _week_services(week_start, week_end).filter(
            payment_method=payment_method,
        ),
        Coalesce("total_amount", "price"),
    )


def week_tax_and_discount(week_start, week_end):
    """
    Impuestos cobrados y descuentos dados en la semana (punto 18), sobre
    exactamente las mismas ventas y servicios que expected_totals_by_method.
    Los impuestos ya están dentro del total esperado (entraron como
    dinero) pero no son del negocio; los descuentos ya están restados.
    Lo que no tiene montos congelados es anterior a impuesto y
    descuento: suma 0, salvo la red de seguridad de ventas.
    """

    sales = _week_sales(week_start, week_end)
    services = _week_services(week_start, week_end)

    tax = _sum(sales, "tax_amount") + _sum(services, "tax_amount")
    discount = _sum(sales, "discount_amount") + _sum(services, "discount_amount")

    for sale in sales.filter(total_amount__isnull=True):
        amounts = sale_amounts(sale)
        tax += amounts.tax_amount
        discount += amounts.discount_amount

    return {"tax": tax, "discount": discount}


def expected_totals_by_method(week_start, week_end):
    """
    Total esperado (ventas + servicios) por cada método de pago,
    congelado más tarde en CashClosing.expected_cash/expected_card/
    expected_transfer/expected_other. El negocio concilia efectivo +
    vouchers de tarjeta + comprobantes de transferencia contra esto,
    no solo efectivo.
    """
    return {
        method: (
            sales_total_by_method(week_start, week_end, method)
            + services_total_by_method(week_start, week_end, method)
        )
        for method in PaymentMethod.values
    }


def expected_total(week_start, week_end):
    return sum(
        expected_totals_by_method(week_start, week_end).values(),
    )


def petty_cash_outflows_total(week_start, week_end):
    """Suma de las salidas de caja chica de la semana (puntos 21 + 22)."""

    return _sum(
        PettyCashMovement.objects.filter(
            date__gte=week_start,
            date__lte=week_end,
        ),
        "amount",
    )


def inherited_petty_cash_opening(week_start):
    """
    Fondo de caja chica con el que arranca la semana: el que definió el
    último cierre anterior a ella. None si no hay cierre anterior (la
    primera vez): ahí el fondo se escribe al cerrar.
    """

    previous = (
        CashClosing.objects.filter(week_start__lt=week_start)
        .order_by("-week_start")
        .first()
    )

    return previous.next_petty_cash_opening if previous else None


def is_week_closed(day):
    return CashClosing.objects.filter(week_start=week_start_for(day)).exists()


def cash_closings():
    return CashClosing.objects.all().order_by("-week_start")


def last_finished_week_start(today=None):
    """
    Fecha de inicio (sábado) de la última semana que ya terminó: la del
    viernes más reciente, o la de hoy mismo si hoy es viernes. Es también
    el sábado más tarde que se puede cerrar (ver create_cash_closing).
    """
    today = today or timezone.localdate()

    days_since_friday = (today.weekday() - FRIDAY) % 7
    last_friday = today - timedelta(days=days_since_friday)

    return last_friday - timedelta(days=6)


def week_start_for(value):
    """Sábado en que empieza la semana de caja a la que pertenece `value`."""

    return value - timedelta(days=(value.weekday() - SATURDAY) % 7)


def _weeks_with_movement(oldest_start, newest_end):
    """
    Sábados de las semanas que tuvieron ventas o servicios cobrados en el
    rango. Usa los mismos filtros que expected_totals_by_method, así que
    una semana "con movimiento" es exactamente una semana con dinero que
    conciliar: ventas confirmadas y activas, y servicios entregados.
    """

    sale_dates = (
        SaleItem.objects.filter(
            sale__status=SaleStatus.CONFIRMED,
            sale__is_active=True,
            sale__sale_date__gte=oldest_start,
            sale__sale_date__lte=newest_end,
        )
        .values_list("sale__sale_date", flat=True)
        .distinct()
    )

    service_dates = (
        InjectorServiceRecord.objects.filter(
            status=InjectorServiceStatus.DELIVERED,
            is_active=True,
            delivered_at__date__gte=oldest_start,
            delivered_at__date__lte=newest_end,
        )
        .annotate(delivered_date=TruncDate("delivered_at"))
        .values_list("delivered_date", flat=True)
        .distinct()
    )

    return {
        week_start_for(value)
        for value in [*sale_dates, *service_dates]
        if value is not None
    }


def weeks_pending_closing(today=None, lookback=WEEKS_PENDING_LOOKBACK):
    """
    Semanas que todavía hay que cerrar, de la más reciente a la más
    antigua. Son las únicas que se pueden cerrar, así que el formulario de
    cierre las ofrece como lista en vez de pedir una fecha en un
    calendario.

    Una semana entra solo si cumple las tres condiciones: ya terminó (su
    viernes pasó), no tiene cierre, y tuvo ventas o servicios cobrados. Lo
    último evita ofrecer semanas en las que no hubo nada que conciliar
    (por ejemplo, las anteriores a que el negocio empezara a usar el
    sistema).

    Mira hasta `lookback` semanas hacia atrás.
    """

    newest = last_finished_week_start(today)

    starts = [
        newest - timedelta(days=7 * offset)
        for offset in range(lookback)
    ]

    oldest_start = starts[-1]
    newest_end = newest + timedelta(days=6)

    already_closed = set(
        CashClosing.objects.filter(
            week_start__in=starts,
        ).values_list("week_start", flat=True)
    )

    with_movement = _weeks_with_movement(oldest_start, newest_end)

    return [
        {
            "week_start": week_start,
            "week_end": week_start + timedelta(days=6),
        }
        for week_start in starts
        if week_start not in already_closed and week_start in with_movement
    ]


def pending_closing_week_start(today=None):
    """
    Fecha de inicio (sábado) de la última semana ya terminada que
    todavía no tiene un CashClosing, o None si esa semana ya está
    cerrada. Usada por el dashboard para avisar "falta cerrar caja".
    """
    week_start = last_finished_week_start(today)

    if CashClosing.objects.filter(week_start=week_start).exists():
        return None

    return week_start
