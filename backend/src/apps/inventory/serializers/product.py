from rest_framework import serializers

from apps.inventory.models import (
    Product,
    ProductReference,
    StorageLocation,
)
from apps.inventory.selectors import current_stock


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
        if hasattr(obj, "current_stock"):
            return obj.current_stock

        return current_stock(obj)


class ProductReferenceSerializer(serializers.ModelSerializer):
    product_detail = serializers.SerializerMethodField()

    class Meta:
        model = ProductReference
        fields = (
            "id",
            "product",
            "product_detail",
            "manufacturer",
            "reference_code",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def validate_reference_code(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "El código de referencia es obligatorio."
            )

        return value.upper()

    def validate_manufacturer(self, value):
        return value.strip()

    def get_product_detail(self, obj):
        return {
            "id": obj.product_id,
            "standard_code": obj.product.standard_code,
            "name": obj.product.name,
            "description": obj.product.description,
        }