from rest_framework import permissions, viewsets

from apps.inventory.models import (
    InventoryCount,
    InventoryCountItem,
)
from apps.inventory.serializers import (
    InventoryCountItemSerializer,
    InventoryCountSerializer,
)


class InventoryCountViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryCountSerializer
    permission_classes = [permissions.IsAuthenticated]

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


class InventoryCountItemViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryCountItemSerializer
    permission_classes = [permissions.IsAuthenticated]

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