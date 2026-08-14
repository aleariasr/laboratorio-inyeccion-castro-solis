from rest_framework import filters, viewsets
from rest_framework.exceptions import ValidationError

from apps.core.permissions import (
    InventoryPermission,
)
from apps.core.query_params import (
    parse_date_query_param,
    parse_positive_integer_query_param,
)
from apps.inventory.models import StockMovement
from apps.inventory.serializers import (
    StockMovementSerializer,
)


class StockMovementViewSet(
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = StockMovementSerializer
    permission_classes = [InventoryPermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at"]
    ordering = ["-created_at", "-id"]

    def get_queryset(self):
        queryset = (
            StockMovement.objects
            .select_related(
                "product",
                "created_by",
                "purchase_item__purchase",
                "sale_item__sale",
                "reverses_movement",
                "inventory_count",
            )
        )

        product_id = parse_positive_integer_query_param(
            self.request.query_params.get("product"),
            name="product",
        )
        location_id = parse_positive_integer_query_param(
            self.request.query_params.get("location"),
            name="location",
        )
        purchase_id = parse_positive_integer_query_param(
            self.request.query_params.get("purchase"),
            name="purchase",
        )
        sale_id = parse_positive_integer_query_param(
            self.request.query_params.get("sale"),
            name="sale",
        )
        inventory_count_id = parse_positive_integer_query_param(
            self.request.query_params.get("inventory_count"),
            name="inventory_count",
        )
        movement_type = self.request.query_params.get(
            "movement_type", "",
        ).strip()
        direction = self.request.query_params.get(
            "direction", "",
        ).strip()
        date_from = parse_date_query_param(
            self.request.query_params.get("date_from"),
            name="date_from",
        )
        date_to = parse_date_query_param(
            self.request.query_params.get("date_to"),
            name="date_to",
        )

        if date_from and date_to and date_from > date_to:
            raise ValidationError(
                {
                    "date_to": [
                        "date_to no puede ser anterior a date_from."
                    ]
                }
            )

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        if location_id:
            queryset = queryset.filter(
                product__storage_location_id=location_id,
            )

        if purchase_id:
            queryset = queryset.filter(
                purchase_item__purchase_id=purchase_id,
            )

        if sale_id:
            queryset = queryset.filter(
                sale_item__sale_id=sale_id,
            )

        if inventory_count_id:
            queryset = queryset.filter(
                inventory_count_id=inventory_count_id,
            )

        if movement_type:
            queryset = queryset.filter(
                movement_type=movement_type.upper(),
            )

        if direction:
            queryset = queryset.filter(
                direction=direction.upper(),
            )

        if date_from:
            queryset = queryset.filter(
                created_at__date__gte=date_from,
            )

        if date_to:
            queryset = queryset.filter(
                created_at__date__lte=date_to,
            )

        return queryset
