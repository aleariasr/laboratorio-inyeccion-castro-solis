from django.db.models import Q
from rest_framework import viewsets
from rest_framework.exceptions import MethodNotAllowed

from apps.core.permissions import InventoryPermission
from apps.core.query_params import (
    parse_boolean_query_param,
    parse_positive_integer_query_param,
)
from apps.inventory.models import (
    ProductReference,
    StorageLocation,
)
from apps.inventory.selectors import current_stock_bulk
from apps.inventory.serializers import (
    ProductReferenceSerializer,
    ProductSerializer,
    StorageLocationSerializer,
)


class NonDestructiveDeleteMixin:
    """
    Impide el borrado físico de entidades operativas.

    Estas entidades deben desactivarse mediante PATCH y conservarse
    para mantener trazabilidad y relaciones históricas.
    """

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            method="DELETE",
            detail=(
                "Este registro no puede eliminarse. "
                "Debe desactivarlo mediante una actualización."
            ),
        )


class StorageLocationViewSet(
    NonDestructiveDeleteMixin,
    viewsets.ModelViewSet,
):
    serializer_class = StorageLocationSerializer
    permission_classes = [InventoryPermission]

    def get_queryset(self):
        queryset = StorageLocation.objects.order_by("code")

        query = self.request.query_params.get("q", "").strip()
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(code__icontains=query)
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


class ProductViewSet(
    NonDestructiveDeleteMixin,
    viewsets.ModelViewSet,
):
    serializer_class = ProductSerializer
    permission_classes = [InventoryPermission]

    def get_queryset(self):
        queryset = current_stock_bulk().select_related(
            "storage_location",
        )

        query = self.request.query_params.get("q", "").strip()
        storage_location_id = parse_positive_integer_query_param(
            self.request.query_params.get("storage_location"),
            name="storage_location",
        )
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(standard_code__icontains=query)
                | Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(storage_location__code__icontains=query)
            )

        if storage_location_id is not None:
            queryset = queryset.filter(
                storage_location_id=storage_location_id,
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


class ProductReferenceViewSet(
    NonDestructiveDeleteMixin,
    viewsets.ModelViewSet,
):
    serializer_class = ProductReferenceSerializer
    permission_classes = [InventoryPermission]

    def get_queryset(self):
        queryset = (
            ProductReference.objects
            .select_related("product")
            .order_by("reference_code")
        )

        query = self.request.query_params.get("q", "").strip()
        product_id = parse_positive_integer_query_param(
            self.request.query_params.get("product"),
            name="product",
        )
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"),
            name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(reference_code__icontains=query)
                | Q(manufacturer__icontains=query)
                | Q(description__icontains=query)
                | Q(product__standard_code__icontains=query)
                | Q(product__name__icontains=query)
            )

        if product_id is not None:
            queryset = queryset.filter(product_id=product_id)

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
