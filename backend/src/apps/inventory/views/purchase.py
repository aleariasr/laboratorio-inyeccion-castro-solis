from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import InventoryPermission

from apps.inventory.exceptions import (
    InventoryError,
    PurchaseAlreadyConfirmedError,
    PurchaseCancelledError,
    PurchaseCannotBeCancelledError,
    PurchaseWithoutItemsError,
)

from apps.inventory.models import Purchase, PurchaseItem

from apps.inventory.serializers import (
    ProductCostHistorySerializer,
    PurchaseCostCalculationSerializer,
    PurchaseItemSerializer,
    PurchaseSerializer,
    PurchaseCostSummaryInputSerializer,
)

from apps.inventory.services import (
    calculate_purchase_costs,
    cancel_purchase,
    confirm_purchase,
    purchase_cost_summary,
)


class PurchaseViewSet(viewsets.ModelViewSet):
    queryset = (
        Purchase.objects.select_related("supplier")
        .prefetch_related(
            "items",
            "items__supplier_product",
            "items__supplier_product__supplier",
            "items__supplier_product__product",
        )
        .order_by(
            "-purchase_date",
            "-id",
        )
    )
    serializer_class = PurchaseSerializer
    permission_classes = [InventoryPermission]

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
        purchase = self.get_object()

        try:
            purchase = confirm_purchase(
                purchase=purchase,
                user=request.user,
            )
        except (
            PurchaseAlreadyConfirmedError,
            PurchaseCancelledError,
            PurchaseWithoutItemsError,
        ) as exc:
            return Response(
                {"detail": str(exc) or exc.__class__.__name__},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(purchase)

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
        purchase = self.get_object()

        try:
            purchase = cancel_purchase(
                purchase=purchase,
                user=request.user,
            )
        except PurchaseCannotBeCancelledError as exc:
            return Response(
                {"detail": str(exc) or exc.__class__.__name__},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(purchase)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )
    @action(
        detail=True,
        methods=["post"],
        url_path="calculate-costs",
    )
    def calculate_costs(self, request, pk=None):
        purchase = self.get_object()

        input_serializer = PurchaseCostCalculationSerializer(
            data=request.data,
        )
        input_serializer.is_valid(
            raise_exception=True,
        )

        try:
            histories = calculate_purchase_costs(
                purchase=purchase,
                margin_percentage=input_serializer.validated_data[
                    "margin_percentage"
                ],
                user=request.user,
            )
        except InventoryError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output_serializer = ProductCostHistorySerializer(
            histories,
            many=True,
        )

        return Response(
            output_serializer.data,
            status=status.HTTP_200_OK,
        )
    
    @action(
        detail=True,
        methods=["get"],
        url_path="cost-summary",
    )
    def cost_summary(self, request, pk=None):
        purchase = self.get_object()

        input_serializer = PurchaseCostSummaryInputSerializer(
            data=request.query_params,
        )
        input_serializer.is_valid(
            raise_exception=True,
        )

        try:
            summary = purchase_cost_summary(
                purchase=purchase,
                margin_percentage=input_serializer.validated_data[
                    "margin_percentage"
                ],
            )
        except InventoryError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            summary,
            status=status.HTTP_200_OK,
        )


class PurchaseItemViewSet(viewsets.ModelViewSet):
    queryset = (
        PurchaseItem.objects.select_related(
            "purchase",
            "supplier_product",
            "supplier_product__supplier",
            "supplier_product__product",
        )
        .order_by("id")
    )
    serializer_class = PurchaseItemSerializer
    permission_classes = [InventoryPermission]

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )