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
    FutureWeekClosingError,
    InvalidWeekStartError,
)
from apps.cash.selectors import (
    cash_closings,
    expected_totals_by_method,
    last_finished_week_start,
    week_tax_and_discount,
    weeks_pending_closing,
)
from apps.cash.serializers import (
    CashClosingCreateSerializer,
    CashClosingSerializer,
    business_income,
)
from apps.cash.services import SATURDAY, create_cash_closing
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
            }
        )
