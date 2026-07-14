from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status, viewsets

from apps.core.permissions import SalesPermission

from apps.sales.exceptions import (
    InsufficientStockError,
    SaleAlreadyCancelledError,
    SaleAlreadyConfirmedError,
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


class SaleViewSet(viewsets.ModelViewSet):
    queryset = (
        Sale.objects.select_related("customer")
        .prefetch_related(
            "items",
            "items__product",
        )
        .order_by(
            "-sale_date",
            "-id",
        )
    )
    serializer_class = SaleSerializer
    permission_classes = [SalesPermission]

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )

    def destroy(self, request, *args, **kwargs):
        sale = self.get_object()

        if sale.status != SaleStatus.DRAFT:
            return Response(
                {
                    "detail": (
                        "Solo se pueden eliminar ventas en borrador."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().destroy(
            request,
            *args,
            **kwargs,
        )

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
            SaleCancelledError,
            SaleWithoutItemsError,
        ) as exc:
            return Response(
                {"detail": str(exc) or exc.__class__.__name__},
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
                        or exc.__class__.__name__
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

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )

    def destroy(self, request, *args, **kwargs):
        sale_item = self.get_object()

        if sale_item.sale.status != SaleStatus.DRAFT:
            return Response(
                {
                    "detail": (
                        "Solo se pueden eliminar líneas "
                        "de ventas en borrador."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().destroy(
            request,
            *args,
            **kwargs,
        )