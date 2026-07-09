from rest_framework import permissions, viewsets

from apps.inventory.models import (
    ImportCost,
    ImportCostCategory,
    ProductCostHistory,
)
from apps.inventory.serializers import (
    ImportCostCategorySerializer,
    ImportCostSerializer,
    ProductCostHistorySerializer,
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


class ProductCostHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ProductCostHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = (
            ProductCostHistory.objects
            .select_related(
                "product",
                "purchase",
                "purchase__supplier",
            )
            .order_by(
                "-calculated_at",
                "-id",
            )
        )

        product_id = self.request.query_params.get("product")
        purchase_id = self.request.query_params.get("purchase")

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        if purchase_id:
            queryset = queryset.filter(purchase_id=purchase_id)

        return queryset