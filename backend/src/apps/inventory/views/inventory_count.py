from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status, viewsets

from apps.core.permissions import InventoryPermission

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
from apps.inventory.services import approve_inventory_count


class InventoryCountViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryCountSerializer
    permission_classes = [InventoryPermission]

    def get_queryset(self):
        queryset = InventoryCount.objects.order_by(
            "-count_date",
            "-id",
        )

        status_value = self.request.query_params.get("status")

        if status_value:
            queryset = queryset.filter(status=status_value)

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


class InventoryCountItemViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryCountItemSerializer
    permission_classes = [InventoryPermission]

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