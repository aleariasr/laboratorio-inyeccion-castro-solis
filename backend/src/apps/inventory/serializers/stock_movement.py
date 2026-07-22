from rest_framework import serializers

from apps.inventory.models import StockMovement


class StockMovementSerializer(
    serializers.ModelSerializer,
):
    movement_type_display = (
        serializers.CharField(
            source="get_movement_type_display",
            read_only=True,
        )
    )
    direction_display = serializers.CharField(
        source="get_direction_display",
        read_only=True,
    )
    purchase_invoice_number = (
        serializers.SerializerMethodField()
    )
    sale_id = serializers.SerializerMethodField()
    created_by_username = (
        serializers.SerializerMethodField()
    )

    class Meta:
        model = StockMovement
        fields = (
            "id",
            "product",
            "movement_type",
            "movement_type_display",
            "direction",
            "direction_display",
            "quantity",
            "purchase_item",
            "purchase_invoice_number",
            "sale_item",
            "sale_id",
            "reverses_movement",
            "notes",
            "created_by_username",
            "created_at",
        )
        read_only_fields = fields

    def get_purchase_invoice_number(
        self,
        obj: StockMovement,
    ) -> str | None:
        if obj.purchase_item_id is None:
            return None

        return (
            obj.purchase_item.purchase.invoice_number
        )

    def get_sale_id(
        self,
        obj: StockMovement,
    ) -> int | None:
        if obj.sale_item_id is None:
            return None

        return obj.sale_item.sale_id

    def get_created_by_username(
        self,
        obj: StockMovement,
    ) -> str | None:
        if obj.created_by_id is None:
            return None

        return obj.created_by.get_username()
