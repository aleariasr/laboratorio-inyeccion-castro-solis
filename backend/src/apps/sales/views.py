from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.sales.exceptions import (
    InsufficientStockError,
    SaleAlreadyCancelledError,
    SaleAlreadyConfirmedError,
    SaleCancelledError,
    SaleNotConfirmedError,
    SaleWithoutItemsError,
)
from apps.sales.models import Sale, SaleItem
from apps.sales.serializers import (
    SaleItemSerializer,
    SaleSerializer,
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
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
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

        try:
            sale = cancel_sale(
                sale=sale,
                user=request.user,
            )
        except (
            SaleAlreadyCancelledError,
            SaleNotConfirmedError,
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


class SaleItemViewSet(viewsets.ModelViewSet):
    queryset = (
        SaleItem.objects.select_related(
            "sale",
            "product",
        )
        .order_by("id")
    )
    serializer_class = SaleItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )