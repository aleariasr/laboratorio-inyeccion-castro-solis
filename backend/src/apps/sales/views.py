from django.db import transaction
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework import filters, status, viewsets

from apps.core.locking import lock_document
from apps.core.permissions import SalesPermission
from apps.core.query_params import (
    parse_boolean_query_param,
    parse_date_query_param,
)

from apps.sales.exceptions import (
    InsufficientStockError,
    SaleAlreadyCancelledError,
    SaleAlreadyConfirmedError,
    SaleAmountsError,
    SaleCancelledError,
    SaleNotConfirmedError,
    SaleWithoutItemsError,
)
from apps.sales.models import (
    Sale,
    SaleItem,
    SaleStatus,
)
from apps.sales.serializers import (
    SaleItemSerializer,
    SaleSerializer,
    SaleCancellationSerializer,
)
from apps.sales.services import (
    cancel_sale,
    confirm_sale,
)


def lock_draft_sale(sale_id, message):
    """La venta bloqueada mientras se escribe en ella (ver lock_document)."""

    return lock_document(
        Sale,
        sale_id,
        editable_statuses={SaleStatus.DRAFT},
        message=message,
    )


class SaleViewSet(viewsets.ModelViewSet):
    serializer_class = SaleSerializer
    permission_classes = [SalesPermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["sale_date", "status", "created_at"]
    ordering = ["-sale_date", "-id"]

    def get_queryset(self):
        queryset = (
            Sale.objects.select_related("customer")
            .prefetch_related("items", "items__product")
        )

        query = self.request.query_params.get("q", "").strip()
        customer_id = self.request.query_params.get("customer")
        status_value = self.request.query_params.get("status", "").strip()
        currency_value = self.request.query_params.get("currency", "").strip()
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )
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
                {"date_to": ["date_to no puede ser anterior a date_from."]}
            )

        if query:
            queryset = queryset.filter(
                customer__display_name__icontains=query
            )

        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        if status_value:
            queryset = queryset.filter(status=status_value.upper())

        if currency_value:
            queryset = queryset.filter(currency=currency_value.upper())

        if date_from:
            queryset = queryset.filter(sale_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(sale_date__lte=date_to)

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        return queryset

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.instance = lock_draft_sale(
            serializer.instance.pk,
            "Solo se pueden modificar ventas en borrador.",
        )
        serializer.save(
            updated_by=self.request.user,
        )

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        sale = lock_draft_sale(
            self.get_object().pk,
            "Solo se pueden eliminar ventas en borrador.",
        )

        self.perform_destroy(sale)

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="confirm",
    )
    def confirm(self, request, pk=None):
        sale = self.get_object()

        try:
            sale = confirm_sale(
                sale=sale,
                user=request.user,
            )
        except (
            InsufficientStockError,
            SaleAlreadyConfirmedError,
            SaleAmountsError,
            SaleCancelledError,
            SaleWithoutItemsError,
        ) as exc:
            return Response(
                {"detail": str(exc) or (exc.__doc__ or "").strip()},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(sale)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="cancel",
    )
    def cancel(self, request, pk=None):
        sale = self.get_object()

        input_serializer = SaleCancellationSerializer(
            data=request.data,
        )
        input_serializer.is_valid(raise_exception=True)

        try:
            sale = cancel_sale(
                sale=sale,
                user=request.user,
                reason=input_serializer.validated_data["reason"],
            )
        except (
            SaleAlreadyCancelledError,
            SaleNotConfirmedError,
        ) as exc:
            return Response(
                {
                    "detail": (
                        str(exc)
                        or (exc.__doc__ or "").strip()
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(sale)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )


class SaleItemViewSet(viewsets.ModelViewSet):
    queryset = (
        SaleItem.objects.select_related(
            "sale",
            "product",
        )
        .order_by("id")
    )
    serializer_class = SaleItemSerializer
    permission_classes = [SalesPermission]

    @transaction.atomic
    def perform_create(self, serializer):
        lock_draft_sale(
            serializer.validated_data["sale"].pk,
            "Solo se pueden modificar líneas de ventas en borrador.",
        )
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        lock_draft_sale(
            serializer.instance.sale_id,
            "Solo se pueden modificar líneas de ventas en borrador.",
        )
        serializer.save(
            updated_by=self.request.user,
        )

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        sale_item = self.get_object()

        lock_draft_sale(
            sale_item.sale_id,
            "Solo se pueden eliminar líneas de ventas en borrador.",
        )

        self.perform_destroy(sale_item)

        return Response(status=status.HTTP_204_NO_CONTENT)