
from django.db.models import Q
from rest_framework import viewsets

from apps.core.permissions import InventoryPermission
from apps.core.query_params import parse_boolean_query_param

from apps.inventory.models import Supplier
from apps.inventory.serializers import SupplierSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [InventoryPermission]

    def get_queryset(self):
        queryset = Supplier.objects.order_by("name")

        query = self.request.query_params.get("q", "").strip()
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(contact_name__icontains=query)
                | Q(phone__icontains=query)
                | Q(email__icontains=query)
                | Q(country__icontains=query)
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
