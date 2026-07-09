from rest_framework import permissions, viewsets

from apps.inventory.models import (
    ImportCost,
    ImportCostCategory,
)
from apps.inventory.serializers import (
    ImportCostCategorySerializer,
    ImportCostSerializer,
)


class ImportCostCategoryViewSet(viewsets.ModelViewSet):
    queryset = ImportCostCategory.objects.order_by("name")
    serializer_class = ImportCostCategorySerializer
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


class ImportCostViewSet(viewsets.ModelViewSet):
    serializer_class = ImportCostSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = (
            ImportCost.objects
            .select_related(
                "purchase",
                "purchase__supplier",
                "category",
            )
            .order_by(
                "purchase__invoice_number",
                "category__name",
                "id",
            )
        )

        purchase_id = self.request.query_params.get("purchase")
        category_id = self.request.query_params.get("category")

        if purchase_id:
            queryset = queryset.filter(purchase_id=purchase_id)

        if category_id:
            queryset = queryset.filter(category_id=category_id)

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