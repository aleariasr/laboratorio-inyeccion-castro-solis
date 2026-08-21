from django.db.models import Q
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework import filters, status, viewsets

from apps.core.permissions import InventoryCountsPermission
from apps.core.query_params import (
    parse_boolean_query_param,
    parse_date_query_param,
)

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import (
    InventoryCount,
    InventoryCountItem,
    InventoryCountStatus,
)
from apps.inventory.serializers import (
    InventoryCountItemSerializer,
    InventoryCountSerializer,
)
from apps.inventory.services import approve_inventory_count, cancel_inventory_count


class InventoryCountViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryCountSerializer
    permission_classes = [InventoryCountsPermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["count_date", "reference", "created_at"]
    ordering = ["-count_date", "-id"]

    def get_queryset(self):
        queryset = InventoryCount.objects.all()

        query = self.request.query_params.get("q", "").strip()
        status_value = self.request.query_params.get("status", "").strip()
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"), name="is_active",
        )
        date_from = parse_date_query_param(
            self.request.query_params.get("date_from"), name="date_from",
        )
        date_to = parse_date_query_param(
            self.request.query_params.get("date_to"), name="date_to",
        )

        if date_from and date_to and date_from > date_to:
            raise ValidationError(
                {"date_to": ["date_to no puede ser anterior a date_from."]}
            )

        if query:
            queryset = queryset.filter(Q(reference__icontains=query))

        if status_value:
            queryset = queryset.filter(status=status_value.upper())

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        if date_from:
            queryset = queryset.filter(count_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(count_date__lte=date_to)

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
        inventory_count = self.get_object()

        if inventory_count.status != InventoryCountStatus.DRAFT:
            return Response(
                {
                    "detail": (
                        "Solo se pueden eliminar conteos "
                        "de inventario en borrador."
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
        url_path="approve",
    )
    def approve(self, request, pk=None):
        inventory_count = self.get_object()

        try:
            inventory_count = approve_inventory_count(
                inventory_count=inventory_count,
                user=request.user,
            )
        except InventoryError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(inventory_count)

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
        inventory_count = self.get_object()

        try:
            inventory_count = cancel_inventory_count(
                inventory_count=inventory_count,
                user=request.user,
            )
        except InventoryError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(inventory_count)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )


class InventoryCountItemViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryCountItemSerializer
    permission_classes = [InventoryCountsPermission]

    def get_queryset(self):
        queryset = (
            InventoryCountItem.objects
            .select_related(
                "inventory_count",
                "product",
                "product__storage_location",
            )
            .order_by(
                "inventory_count__reference",
                "product__standard_code",
            )
        )

        inventory_count_id = self.request.query_params.get(
            "inventory_count"
        )

        if inventory_count_id:
            queryset = queryset.filter(
                inventory_count_id=inventory_count_id
            )

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
        inventory_count_item = self.get_object()

        if (
            inventory_count_item.inventory_count.status
            != InventoryCountStatus.DRAFT
        ):
            return Response(
                {
                    "detail": (
                        "Solo se pueden eliminar líneas "
                        "de conteos en borrador."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().destroy(
            request,
            *args,
            **kwargs,
        )
