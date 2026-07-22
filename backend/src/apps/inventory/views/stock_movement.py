from rest_framework import viewsets
from rest_framework.exceptions import (
    ValidationError,
)

from apps.core.permissions import (
    InventoryPermission,
)
from apps.core.query_params import (
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

    def get_queryset(self):
        product_id = (
            parse_positive_integer_query_param(
                self.request.query_params.get(
                    "product"
                ),
                name="product",
            )
        )

        if product_id is None:
            raise ValidationError(
                {
                    "product": (
                        "Debe indicar el producto "
                        "cuyo historial desea consultar."
                    )
                }
            )

        return (
            StockMovement.objects
            .filter(product_id=product_id)
            .select_related(
                "created_by",
                "purchase_item__purchase",
                "sale_item__sale",
                "reverses_movement",
            )
            .order_by(
                "-created_at",
                "-id",
            )
        )
