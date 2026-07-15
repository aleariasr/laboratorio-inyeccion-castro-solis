
from django.db.models import Q
from rest_framework import viewsets

from apps.core.permissions import InventoryPermission
from apps.core.query_params import (
    parse_boolean_query_param,
    parse_positive_integer_query_param,
)

from apps.inventory.models import SupplierProduct
from apps.inventory.serializers import SupplierProductSerializer


class SupplierProductViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierProductSerializer
    permission_classes = [InventoryPermission]

    def get_queryset(self):
        queryset = (
            SupplierProduct.objects
            .select_related(
                "supplier",
                "product",
            )
            .order_by(
                "supplier__name",
                "product__standard_code",
            )
        )

        query = self.request.query_params.get("q", "").strip()
        supplier_id = parse_positive_integer_query_param(
            self.request.query_params.get("supplier"),
            name="supplier",
        )
        product_id = parse_positive_integer_query_param(
            self.request.query_params.get("product"),
            name="product",
        )
        preferred_supplier = parse_boolean_query_param(
            self.request.query_params.get("preferred_supplier"),
            name="preferred_supplier",
        )
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(supplier_reference__icontains=query)
                | Q(manufacturer__icontains=query)
                | Q(supplier__name__icontains=query)
                | Q(product__standard_code__icontains=query)
                | Q(product__name__icontains=query)
            )

        if supplier_id is not None:
            queryset = queryset.filter(supplier_id=supplier_id)

        if product_id is not None:
            queryset = queryset.filter(product_id=product_id)

        if preferred_supplier is not None:
            queryset = queryset.filter(
                preferred_supplier=preferred_supplier,
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
