from rest_framework import permissions, viewsets

from apps.inventory.models import SupplierProduct
from apps.inventory.serializers import SupplierProductSerializer


class SupplierProductViewSet(viewsets.ModelViewSet):
    queryset = (
        SupplierProduct.objects.select_related(
            "supplier",
            "product",
        )
        .order_by(
            "supplier__name",
            "product__standard_code",
        )
    )
    serializer_class = SupplierProductSerializer
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