from django.db import transaction
from django.db.models import Q

from rest_framework import viewsets
from rest_framework.exceptions import ValidationError

from apps.core.permissions import ProductsPermission, PurchasesPermission
from apps.core.query_params import parse_boolean_query_param

from apps.inventory.models import (
    ImportCost,
    ImportCostCategory,
    ProductCostHistory,
    PurchaseStatus,
)
from apps.inventory.serializers import (
    ImportCostCategorySerializer,
    ImportCostSerializer,
    ProductCostHistorySerializer,
)
from apps.inventory.services import discard_purchase_cost_calculation


class ImportCostCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ImportCostCategorySerializer
    permission_classes = [PurchasesPermission]

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
    permission_classes = [PurchasesPermission]

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

    # Crear, editar (incluido activar o desactivar) o borrar un costo de
    # importación cambia el factor de costo de toda la factura, así que el
    # cálculo de costos guardado queda obsoleto y se descarta (ver
    # discard_purchase_cost_calculation).
    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

        discard_purchase_cost_calculation(
            purchase=serializer.instance.purchase,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )

        discard_purchase_cost_calculation(
            purchase=serializer.instance.purchase,
        )

    @transaction.atomic
    def perform_destroy(self, instance):
        purchase = instance.purchase

        instance.delete()

        discard_purchase_cost_calculation(purchase=purchase)


class ProductCostHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ProductCostHistorySerializer
    permission_classes = [ProductsPermission]

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
        purchase_status = self.request.query_params.get("purchase_status")

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        if purchase_id:
            queryset = queryset.filter(purchase_id=purchase_id)

        # Con purchase_status=CONFIRMED se obtiene el cálculo que de verdad
        # está rigiendo el precio del producto (ver
        # _cost_history_with_suggested_price_in_crc). Sin el filtro se
        # devuelve todo el histórico, que es lo que necesita la pantalla
        # de una compra para ver su propio cálculo.
        if purchase_status:
            if purchase_status not in PurchaseStatus.values:
                raise ValidationError(
                    {
                        "purchase_status": [
                            "Estado de compra inválido.",
                        ],
                    }
                )

            queryset = queryset.filter(purchase__status=purchase_status)

        return queryset