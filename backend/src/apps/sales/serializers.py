from rest_framework import serializers

from apps.customers.models import Customer
from apps.sales.models import Sale, SaleItem, SaleStatus
from apps.sales.selectors import sale_total


class CustomerSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = (
            "id",
            "customer_type",
            "display_name",
            "phone",
            "email",
            "identification",
            "is_active",
        )


class SaleItemSerializer(serializers.ModelSerializer):
    product_detail = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = (
            "id",
            "sale",
            "product",
            "product_detail",
            "quantity",
            "unit_price",
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
        sale = attrs.get("sale")

        if self.instance is not None:
            sale = self.instance.sale

        if sale is not None and sale.status != SaleStatus.DRAFT:
            raise serializers.ValidationError(
                "Solo se pueden modificar líneas de ventas en borrador."
            )

        return attrs

    def get_product_detail(self, obj):
        return {
            "id": obj.product_id,
            "standard_code": obj.product.standard_code,
            "name": obj.product.name,
            "description": obj.product.description,
        }

    def get_subtotal(self, obj):
        return obj.quantity * obj.unit_price


class SaleItemInlineSerializer(serializers.ModelSerializer):
    product_detail = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = (
            "id",
            "product",
            "product_detail",
            "quantity",
            "unit_price",
            "subtotal",
        )

    def get_product_detail(self, obj):
        return {
            "id": obj.product_id,
            "standard_code": obj.product.standard_code,
            "name": obj.product.name,
        }

    def get_subtotal(self, obj):
        return obj.quantity * obj.unit_price


class SaleSerializer(serializers.ModelSerializer):
    currency = serializers.CharField(max_length=3)
    customer_detail = CustomerSummarySerializer(
        source="customer",
        read_only=True,
    )
    items = SaleItemInlineSerializer(
        many=True,
        read_only=True,
    )
    total = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = (
            "id",
            "customer",
            "customer_detail",
            "sale_date",
            "currency",
            "exchange_rate",
            "status",
            "confirmed_at",
            "confirmed_by",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
            "notes",
            "items",
            "total",
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
            "cancellation_reason",
            "created_at",
            "updated_at",
            "total",
        )

    def validate_currency(self, value):
        normalized_currency = value.strip().upper()

        valid_currencies = {
            "CRC",
            "USD",
        }

        if normalized_currency not in valid_currencies:
            raise serializers.ValidationError(
                "Moneda inválida."
            )

        return normalized_currency

    def validate(self, attrs):
        if self.instance is not None and self.instance.status != SaleStatus.DRAFT:
            raise serializers.ValidationError(
                "Solo se pueden modificar ventas en borrador."
            )

        return attrs

    def get_total(self, obj):
        return sale_total(obj)
class SaleCancellationSerializer(serializers.Serializer):
    reason = serializers.CharField(
        min_length=1,
        max_length=1000,
        trim_whitespace=True,
    )

    def validate_reason(self, value):
        normalized_reason = value.strip()

        if not normalized_reason:
            raise serializers.ValidationError(
                "El motivo de anulación es obligatorio."
            )

        return normalized_reason