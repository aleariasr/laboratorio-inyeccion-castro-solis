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
    product_detail = serializers.SerializerMethodField()
    purchase_id = serializers.SerializerMethodField()
    purchase_invoice_number = (
        serializers.SerializerMethodField()
    )
    sale_id = serializers.SerializerMethodField()
    inventory_count_reference = (
        serializers.SerializerMethodField()
    )
    service_record_id = serializers.SerializerMethodField()
    stock_transfer_id = serializers.SerializerMethodField()
    created_by_username = (
        serializers.SerializerMethodField()
    )

    class Meta:
        model = StockMovement
        fields = (
            "id",
            "product",
            "product_detail",
            "movement_type",
            "movement_type_display",
            "direction",
            "direction_display",
            "quantity",
            "purchase_item",
            "purchase_id",
            "purchase_invoice_number",
            "sale_item",
            "sale_id",
            "inventory_count",
            "inventory_count_reference",
            "service_accessory",
            "service_record_id",
            "stock_transfer_id",
            "reverses_movement",
            "notes",
            "created_by_username",
            "created_at",
        )
        read_only_fields = fields

    def get_product_detail(
        self,
        obj: StockMovement,
    ) -> dict:
        return {
            "id": obj.product_id,
            "standard_code": obj.product.standard_code,
            "name": obj.product.name,
        }

    def get_purchase_id(
        self,
        obj: StockMovement,
    ) -> int | None:
        if obj.purchase_item_id is None:
            return None

        return obj.purchase_item.purchase_id

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

    def get_inventory_count_reference(
        self,
        obj: StockMovement,
    ) -> str | None:
        if obj.inventory_count_id is None:
            return None

        return obj.inventory_count.reference

    def get_service_record_id(
        self,
        obj: StockMovement,
    ) -> int | None:
        """
        Servicio del que viene un movimiento SERVICE_USE (o su reversión).

        Queda en null si el accesorio se borró: StockMovement.service_accessory
        es SET_NULL, así que el movimiento sobrevive al accesorio.
        """

        if obj.service_accessory_id is None:
            return None

        return obj.service_accessory.service_record_id

    def get_stock_transfer_id(
        self,
        obj: StockMovement,
    ) -> int | None:
        """Traslado a otra sede del que viene el movimiento (punto 6)."""

        if obj.stock_transfer_item_id is None:
            return None

        return obj.stock_transfer_item.stock_transfer_id

    def get_created_by_username(
        self,
        obj: StockMovement,
    ) -> str | None:
        if obj.created_by_id is None:
            return None

        return obj.created_by.get_username()
