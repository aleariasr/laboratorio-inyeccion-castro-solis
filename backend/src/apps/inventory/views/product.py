from rest_framework import permissions, viewsets

from apps.inventory.models import Product, StorageLocation
from apps.inventory.serializers import (
    ProductSerializer,
    StorageLocationSerializer,
)


class StorageLocationViewSet(viewsets.ModelViewSet):
    queryset = StorageLocation.objects.order_by("code")
    serializer_class = StorageLocationSerializer
    permission_classes = [permissions.IsAuthenticated]


class ProductViewSet(viewsets.ModelViewSet):
    queryset = (
        Product.objects
        .select_related("storage_location")
        .order_by("standard_code")
    )
    serializer_class = ProductSerializer
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