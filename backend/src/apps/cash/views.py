from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.cash.exceptions import (
    CashClosingAlreadyExistsError,
    DifferenceReasonRequiredError,
    FuturePettyCashOutflowError,
    FutureWeekClosingError,
    InvalidWeekStartError,
    PettyCashWeekClosedError,
)
from apps.cash.models import PettyCashMovement
from apps.cash.selectors import (
    cash_closings,
    expected_totals_by_method,
    inherited_petty_cash_opening,
    last_finished_week_start,
    petty_cash_outflows_total,
    week_start_for,
    week_tax_and_discount,
    weeks_pending_closing,
)
from apps.cash.serializers import (
    CashClosingCreateSerializer,
    CashClosingSerializer,
    PettyCashMovementSerializer,
    business_income,
    expected_physical_total,
    petty_cash_balance,
)
from apps.cash.services import (
    SATURDAY,
    create_cash_closing,
    delete_petty_cash_outflow,
    register_petty_cash_outflow,
)
from apps.core.models import PaymentMethod
from apps.core.permissions import CashPermission
from apps.core.query_params import parse_date_query_param


class CashClosingViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Sin PATCH/PUT/DELETE a propósito: un cierre de caja es un
    registro histórico fijo una vez creado (ver CashClosing).
    """

    serializer_class = CashClosingSerializer
    permission_classes = [CashPermission]

    def get_queryset(self):
        queryset = cash_closings()

        query = self.request.query_params.get("q", "").strip()
        date_from = parse_date_query_param(
            self.request.query_params.get("date_from"),
            name="date_from",
        )
        date_to = parse_date_query_param(
            self.request.query_params.get("date_to"),
            name="date_to",
        )

        if date_from and date_to and date_from > date_to:
            raise ValidationError(
                {
                    "date_to": [
                        "date_to no puede ser anterior a date_from."
                    ],
                }
            )

        if query:
            queryset = queryset.filter(
                Q(notes__icontains=query)
                | Q(difference_reason__icontains=query)
            )

        # Entra toda semana que se superponga con el rango, no solo las
        # contenidas: una semana va de sábado a viernes y puede cruzar el
        # borde del mes que se está consultando.
        if date_from:
            queryset = queryset.filter(week_end__gte=date_from)

        if date_to:
            queryset = queryset.filter(week_start__lte=date_to)

        return queryset

    def create(self, request, *args, **kwargs):
        input_serializer = CashClosingCreateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        try:
            closing = create_cash_closing(
                week_start=input_serializer.validated_data["week_start"],
                counted_total=input_serializer.validated_data[
                    "counted_total"
                ],
                difference_reason=input_serializer.validated_data.get(
                    "difference_reason", "",
                ),
                notes=input_serializer.validated_data.get("notes", ""),
                user=request.user,
                petty_cash_opening=input_serializer.validated_data.get(
                    "petty_cash_opening",
                ),
                next_petty_cash_opening=input_serializer.validated_data.get(
                    "next_petty_cash_opening",
                ),
            )
        except (
            InvalidWeekStartError,
            CashClosingAlreadyExistsError,
            DifferenceReasonRequiredError,
            FutureWeekClosingError,
        ) as exc:
            return Response(
                {"detail": str(exc) or exc.__class__.__name__},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output_serializer = self.get_serializer(closing)

        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"])
    def closeable_weeks(self, request):
        """
        Las semanas que se pueden cerrar hoy: las ya terminadas que
        todavía no tienen cierre, de la más reciente a la más antigua. El
        formulario de cierre las ofrece como lista, en vez de pedir un
        sábado en un calendario.

        `next_week_end` es el viernes de la semana en curso: la fecha a
        partir de la cual se podrá cerrar la siguiente.
        """

        return Response(
            {
                "weeks": weeks_pending_closing(),
                "next_week_end": (
                    last_finished_week_start() + timedelta(days=13)
                ),
            }
        )

    @action(detail=False, methods=["get"])
    def preview(self, request):
        week_start = parse_date_query_param(
            request.query_params.get("week_start"),
            name="week_start",
        )

        if week_start is None:
            return Response(
                {
                    "week_start": [
                        "Debe indicar la fecha de inicio de semana (sábado)."
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if week_start.weekday() != SATURDAY:
            return Response(
                {
                    "week_start": [
                        "La semana de un cierre de caja debe iniciar un sábado."
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        week_end = week_start + timedelta(days=6)

        breakdown = expected_totals_by_method(week_start, week_end)
        expected = sum(breakdown.values())
        tax_and_discount = week_tax_and_discount(week_start, week_end)
        inherited_opening = inherited_petty_cash_opening(week_start)
        outflows = petty_cash_outflows_total(week_start, week_end)
        # Sin cierre anterior el fondo se escribe al cerrar: la vista
        # previa lo calcula con 0 y avisa con petty_cash_opening en null.
        opening = inherited_opening if inherited_opening is not None else 0

        return Response(
            {
                "week_start": week_start,
                "week_end": week_end,
                # La consulta de una semana en curso se permite a
                # propósito (sirve para ver cómo va), pero el cierre no:
                # ver create_cash_closing.
                "can_close": week_end <= timezone.localdate(),
                "expected_total": expected,
                "expected_cash": breakdown[PaymentMethod.CASH],
                "expected_card": breakdown[PaymentMethod.CARD],
                "expected_transfer": breakdown[PaymentMethod.TRANSFER],
                "expected_other": breakdown[PaymentMethod.OTHER],
                # Punto 18: mismo bloque que el cierre ya hecho.
                "expected_tax": tax_and_discount["tax"],
                "expected_discount": tax_and_discount["discount"],
                "expected_business_income": business_income(
                    expected,
                    tax_and_discount["tax"],
                ),
                # Puntos 21 + 22.
                "petty_cash_opening": inherited_opening,
                "petty_cash_outflows": outflows,
                "petty_cash_balance": petty_cash_balance(opening, outflows),
                "expected_physical_total": expected_physical_total(
                    expected,
                    opening,
                    outflows,
                ),
            }
        )


class PettyCashMovementViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    Salidas de caja chica (puntos 21 + 22). Sin edición: si una salida
    quedó mal se borra y se registra de nuevo, mientras su semana no esté
    cerrada. ?week_start=AAAA-MM-DD (sábado) filtra una semana; sin él,
    la semana en curso.
    """

    serializer_class = PettyCashMovementSerializer
    permission_classes = [CashPermission]
    pagination_class = None

    def get_queryset(self):
        queryset = PettyCashMovement.objects.select_related("created_by")

        if self.action != "list":
            return queryset

        week_start = parse_date_query_param(
            self.request.query_params.get("week_start"),
            name="week_start",
        ) or week_start_for(timezone.localdate())

        return queryset.filter(
            date__gte=week_start,
            date__lte=week_start + timedelta(days=6),
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            movement = register_petty_cash_outflow(
                date=serializer.validated_data["date"],
                amount=serializer.validated_data["amount"],
                reason=serializer.validated_data["reason"],
                user=request.user,
            )
        except (FuturePettyCashOutflowError, PettyCashWeekClosedError) as exc:
            return Response(
                {"date": [str(exc)]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            self.get_serializer(movement).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        try:
            delete_petty_cash_outflow(movement=self.get_object())
        except PettyCashWeekClosedError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)
