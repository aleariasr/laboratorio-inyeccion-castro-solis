from django.db import transaction
from rest_framework import serializers

from apps.inventory.models import (
    Currency,
    Product,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
    SupplierProduct,
)

from apps.inventory.exchange_rates import (
    CRC_EXCHANGE_RATE,
    USD_EXCHANGE_RATE_RANGE_MESSAGE,
    USD_EXCHANGE_RATE_REQUIRED_MESSAGE,
    is_valid_usd_exchange_rate,
)

from .supplier import SupplierSerializer


class PurchaseItemSerializer(serializers.ModelSerializer):
    supplier_product_detail = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = PurchaseItem
        fields = (
            "id",
            "purchase",
            "product",
            "supplier_product",
            "supplier_product_detail",
            "quantity",
            "unit_cost",
            "subtotal",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "supplier_product",
            "created_at",
            "updated_at",
            "subtotal",
        )

    def validate(self, attrs):
        purchase = attrs.get("purchase")

        if self.instance is not None:
            # Mover la línea a otra compra la dejaba en una confirmada sin
            # entrada de inventario (pasada previa a la 2.5.0).
            if purchase is not None and purchase != self.instance.purchase:
                raise serializers.ValidationError(
                    {"purchase": "Una línea no se cambia de compra."}
                )

            # Antes se respondía 200 y el producto quedaba igual, sin aviso
            # (recorrido del 2026-11-07). La pantalla tampoco lo permite.
            product = attrs.get("product")

            if (
                product is not None
                and product.pk != self.instance.supplier_product.product_id
            ):
                raise serializers.ValidationError(
                    {
                        "product": [
                            "El producto de una línea no se cambia; se "
                            "elimina la línea y se agrega otra."
                        ]
                    }
                )

            purchase = self.instance.purchase

        if purchase is not None and purchase.status != PurchaseStatus.DRAFT:
            raise serializers.ValidationError(
                "Solo se pueden modificar líneas de compras en borrador."
            )

        if self.instance is None and "product" not in attrs:
            raise serializers.ValidationError(
                {"product": ["Este campo es requerido."]}
            )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        product = validated_data.pop("product")
        purchase = validated_data["purchase"]

        supplier_product, _ = SupplierProduct.objects.get_or_create(
            supplier=purchase.supplier,
            product=product,
            defaults={
                "created_by": validated_data.get("created_by"),
                "updated_by": validated_data.get("updated_by"),
            },
        )

        if PurchaseItem.objects.filter(
            purchase=purchase,
            supplier_product=supplier_product,
        ).exists():
            raise serializers.ValidationError(
                {"product": ["Este producto ya fue agregado a la compra."]}
            )

        validated_data["supplier_product"] = supplier_product

        return super().create(validated_data)

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
    exchange_rate = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
    )
    # Si la compra ya tiene costos aplicados (ProductCostHistory). El
    # detalle lo usa para avisar al confirmar una compra sin costos: el
    # precio de venta de sus productos no cambiaría.
    has_cost_calculation = serializers.SerializerMethodField()

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
            "cancellation_reason",
            "notes",
            "items",
            "has_cost_calculation",
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

        # Las líneas apuntan a productos de ese proveedor (SupplierProduct):
        # cambiarlo las dejaba con el proveedor anterior (recorrido del
        # 2026-11-07). La pantalla ya decía que no se puede.
        supplier = attrs.get("supplier")

        if (
            self.instance is not None
            and supplier is not None
            and supplier.pk != self.instance.supplier_id
        ):
            raise serializers.ValidationError(
                {
                    "supplier": [
                        "El proveedor no puede modificarse una vez creada la compra."
                    ]
                }
            )

        currency = attrs.get(
            "currency",
            self.instance.currency if self.instance is not None else None,
        )

        if currency == Currency.CRC:
            # En colones el tipo de cambio no aplica: se guarda 1 aunque
            # llegue otro valor (antes se aceptaba una compra CRC con 520).
            attrs["exchange_rate"] = CRC_EXCHANGE_RATE
        elif currency == Currency.USD:
            exchange_rate = attrs.get("exchange_rate")

            if exchange_rate is None and self.instance is not None:
                exchange_rate = self.instance.exchange_rate

            if exchange_rate is None:
                raise serializers.ValidationError(
                    {"exchange_rate": [USD_EXCHANGE_RATE_REQUIRED_MESSAGE]}
                )

            if not is_valid_usd_exchange_rate(exchange_rate):
                raise serializers.ValidationError(
                    {"exchange_rate": [USD_EXCHANGE_RATE_RANGE_MESSAGE]}
                )

        return attrs

    def get_has_cost_calculation(self, obj):
        if hasattr(obj, "has_cost_calculation"):
            return obj.has_cost_calculation

        return obj.product_cost_history.exists()

class PurchaseCostSummaryInputSerializer(serializers.Serializer):
    margin_percentage = serializers.DecimalField(
        max_digits=8,
        decimal_places=4,
        min_value=0,
    )

class PurchaseCancellationSerializer(serializers.Serializer):
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