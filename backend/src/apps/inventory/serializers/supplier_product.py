from rest_framework import serializers

from apps.inventory.models import SupplierProduct

from .supplier import SupplierSerializer


class SupplierProductSerializer(serializers.ModelSerializer):
    supplier_detail = SupplierSerializer(
        source="supplier",
        read_only=True,
    )
    product_detail = serializers.SerializerMethodField()

    class Meta:
        model = SupplierProduct
        fields = (
            "id",
            "supplier",
            "supplier_detail",
            "product",
            "product_detail",
            "supplier_reference",
            "manufacturer",
            "preferred_supplier",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def get_product_detail(self, obj):
        return {
            "id": obj.product_id,
            "standard_code": obj.product.standard_code,
            "name": obj.product.name,
            "description": obj.product.description,
        }