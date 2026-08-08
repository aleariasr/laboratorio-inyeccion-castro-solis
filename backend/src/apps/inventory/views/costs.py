from django.db.models import Q

from rest_framework import viewsets

from apps.core.permissions import InventoryPermission
from apps.core.query_params import parse_boolean_query_param

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
    serializer_class = ImportCostCategorySerializer
    permission_classes = [InventoryPermission]

    def get_queryset(self):
        queryset = ImportCostCategory.objects.order_by("name")

        query = self.request.query_params.get("q", "").strip()
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
            )

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


class ImportCostViewSet(viewsets.ModelViewSet):
    serializer_class = ImportCostSerializer
    permission_classes = [InventoryPermission]

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
    permission_classes = [InventoryPermission]

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