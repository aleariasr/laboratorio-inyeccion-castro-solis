from datetime import timedelta

from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.cash.exceptions import (
    CashClosingAlreadyExistsError,
    DifferenceReasonRequiredError,
    InvalidWeekStartError,
)
from apps.cash.selectors import cash_closings, expected_totals_by_method
from apps.cash.serializers import (
    CashClosingCreateSerializer,
    CashClosingSerializer,
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
        return cash_closings()

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

        return Response(
            {
                "week_start": week_start,
                "week_end": week_end,
                "expected_total": sum(breakdown.values()),
                "expected_cash": breakdown[PaymentMethod.CASH],
                "expected_card": breakdown[PaymentMethod.CARD],
                "expected_transfer": breakdown[PaymentMethod.TRANSFER],
                "expected_other": breakdown[PaymentMethod.OTHER],
            }
        )
