from rest_framework import serializers

from apps.inventory.models import (
    Currency,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
)

from .supplier import SupplierSerializer


class PurchaseItemSerializer(serializers.ModelSerializer):
    supplier_product_detail = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseItem
        fields = (
            "id",
            "purchase",
            "supplier_product",
            "supplier_product_detail",
            "quantity",
            "unit_cost",
            "subtotal",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
            "subtotal",
        )

    def validate(self, attrs):
        purchase = attrs.get("purchase")

        if self.instance is not None:
            purchase = self.instance.purchase

        if purchase is not None and purchase.status != PurchaseStatus.DRAFT:
            raise serializers.ValidationError(
                "Solo se pueden modificar líneas de compras en borrador."
            )

        return attrs

    def get_supplier_product_detail(self, obj):
        supplier_product = obj.supplier_product

        return {
            "id": supplier_product.id,
            "supplier": {
                "id": supplier_product.supplier_id,
                "name": supplier_product.supplier.name,
            },
            "product": {
                "id": supplier_product.product_id,
                "standard_code": supplier_product.product.standard_code,
                "name": supplier_product.product.name,
            },
            "supplier_reference": supplier_product.supplier_reference,
            "manufacturer": supplier_product.manufacturer,
        }

    def get_subtotal(self, obj):
        return obj.quantity * obj.unit_cost


class PurchaseItemInlineSerializer(serializers.ModelSerializer):
    supplier_product_detail = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseItem
        fields = (
            "id",
            "supplier_product",
            "supplier_product_detail",
            "quantity",
            "unit_cost",
            "subtotal",
        )

    def get_supplier_product_detail(self, obj):
        supplier_product = obj.supplier_product

        return {
            "id": supplier_product.id,
            "supplier_reference": supplier_product.supplier_reference,
            "manufacturer": supplier_product.manufacturer,
            "product": {
                "id": supplier_product.product_id,
                "standard_code": supplier_product.product.standard_code,
                "name": supplier_product.product.name,
            },
        }

    def get_subtotal(self, obj):
        return obj.quantity * obj.unit_cost


class PurchaseSerializer(serializers.ModelSerializer):
    currency = serializers.CharField(max_length=3)
    
    supplier_detail = SupplierSerializer(
        source="supplier",
        read_only=True,
    )
    items = PurchaseItemInlineSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = Purchase
        fields = (
            "id",
            "supplier",
            "supplier_detail",
            "invoice_number",
            "purchase_date",
            "currency",
            "exchange_rate",
            "status",
            "confirmed_at",
            "confirmed_by",
            "cancelled_at",
            "cancelled_by",
            "notes",
            "items",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "confirmed_at",
            "confirmed_by",
            "cancelled_at",
            "cancelled_by",
            "created_at",
            "updated_at",
        )

    def validate_currency(self, value):
        normalized_currency = value.strip().upper()

        valid_currencies = {
            choice.value
            for choice in Currency
        }

        if normalized_currency not in valid_currencies:
            raise serializers.ValidationError(
                "Moneda inválida."
            )

        return normalized_currency

    def validate_invoice_number(self, value):
        return value.strip().upper()

    def validate(self, attrs):
        if self.instance is not None and self.instance.status != PurchaseStatus.DRAFT:
            raise serializers.ValidationError(
                "Solo se pueden modificar compras en borrador."
            )

        return attrs