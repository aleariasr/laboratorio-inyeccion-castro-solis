from django.db import transaction
from django.db.models import Q

from rest_framework import filters, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import PurchasesPermission, ViewCostsRequired
from apps.core.query_params import (
    parse_boolean_query_param,
    parse_date_query_param,
)

from apps.inventory.exceptions import (
    InventoryError,
    PurchaseAlreadyConfirmedError,
    PurchaseCancelledError,
    PurchaseWithoutItemsError,
    InsufficientStockForPurchaseReversalError,
)

from apps.inventory.models import (
    Purchase,
    PurchaseItem,
    PurchaseStatus,
)

from apps.inventory.serializers import (
    ProductCostHistorySerializer,
    PurchaseCostCalculationSerializer,
    PurchaseItemSerializer,
    PurchaseSerializer,
    PurchaseCostSummaryInputSerializer,
    PurchaseCancellationSerializer,
)

from apps.inventory.services import (
    calculate_purchase_costs,
    cancel_purchase,
    confirm_purchase,
    discard_purchase_cost_calculation,
    purchase_cost_summary,
)


class PurchaseViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseSerializer
    permission_classes = [PurchasesPermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = [
        "purchase_date",
        "invoice_number",
        "status",
        "created_at",
    ]
    ordering = [
        "-purchase_date",
        "-id",
    ]

    def get_queryset(self):
        queryset = (
            Purchase.objects.select_related("supplier")
            .prefetch_related(
                "items",
                "items__supplier_product",
                "items__supplier_product__supplier",
                "items__supplier_product__product",
            )
        )

        query = self.request.query_params.get("q", "").strip()
        supplier_id = self.request.query_params.get("supplier")
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
                {
                    "date_to": [
                        "date_to no puede ser anterior a date_from.",
                    ]
                }
            )

        if query:
            queryset = queryset.filter(
                Q(invoice_number__icontains=query)
                | Q(supplier__name__icontains=query)
            )

        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)

        if status_value:
            queryset = queryset.filter(status=status_value.upper())

        if currency_value:
            queryset = queryset.filter(currency=currency_value.upper())

        if date_from:
            queryset = queryset.filter(purchase_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(purchase_date__lte=date_to)

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        return queryset

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
        purchase = self.get_object()

        if purchase.status != PurchaseStatus.DRAFT:
            return Response(
                {
                    "detail": (
                        "Solo se pueden eliminar compras en borrador."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # ProductCostHistory apunta a Purchase con PROTECT, así que
            # sin esto borrar un borrador al que ya se le calcularon
            # costos fallaba con ProtectedError.
            discard_purchase_cost_calculation(purchase=purchase)

            self.perform_destroy(purchase)

        return Response(
            status=status.HTTP_204_NO_CONTENT,
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
                {
                    "detail": (
                        str(exc)
                        or exc.__class__.__name__
                    )
                },
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

        input_serializer = PurchaseCancellationSerializer(
            data=request.data,
        )
        input_serializer.is_valid(raise_exception=True)

        try:
            purchase = cancel_purchase(
                purchase=purchase,
                user=request.user,
                reason=input_serializer.validated_data["reason"],
            )
        except (
            PurchaseCancelledError,
            InsufficientStockForPurchaseReversalError,
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

        serializer = self.get_serializer(purchase)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )
    @action(
        detail=True,
        methods=["post"],
        url_path="calculate-costs",
        permission_classes=[PurchasesPermission, ViewCostsRequired],
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
        # Ver la compra (view_purchases) no alcanza: el resumen trae el
        # costo final y el precio sugerido de cada línea.
        permission_classes=[PurchasesPermission, ViewCostsRequired],
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
    permission_classes = [PurchasesPermission]

    # Agregar, editar o borrar una línea cambia el subtotal de la factura
    # y con él el factor de costo, así que el cálculo de costos guardado
    # queda obsoleto y se descarta (ver
    # discard_purchase_cost_calculation).
    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

        discard_purchase_cost_calculation(
            purchase=serializer.instance.purchase,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )

        discard_purchase_cost_calculation(
            purchase=serializer.instance.purchase,
        )

    def destroy(self, request, *args, **kwargs):
        purchase_item = self.get_object()

        if purchase_item.purchase.status != PurchaseStatus.DRAFT:
            return Response(
                {
                    "detail": (
                        "Solo se pueden eliminar líneas "
                        "de compras en borrador."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            discard_purchase_cost_calculation(
                purchase=purchase_item.purchase,
            )

            self.perform_destroy(purchase_item)

        return Response(
            status=status.HTTP_204_NO_CONTENT,
        )