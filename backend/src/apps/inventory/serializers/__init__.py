from rest_framework import serializers

from apps.inventory.models import Product, StorageLocation
from apps.inventory.selectors import current_stock

from .supplier import SupplierSerializer
from .supplier_product import SupplierProductSerializer
from .purchase import (
    PurchaseItemSerializer,
    PurchaseSerializer,
)


class StorageLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageLocation
        fields = (
            "id",
            "code",
            "description",
            "is_active",
        )


class ProductSerializer(serializers.ModelSerializer):
    current_stock = serializers.SerializerMethodField()
    storage_location_detail = StorageLocationSerializer(
        source="storage_location",
        read_only=True,
    )

    class Meta:
        model = Product
        fields = (
            "id",
            "standard_code",
            "name",
            "description",
            "storage_location",
            "storage_location_detail",
            "minimum_stock",
            "unit_of_measure",
            "current_stock",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
            "current_stock",
        )

    def get_current_stock(self, obj):
        return current_stock(obj)