from decimal import Decimal

from rest_framework import serializers

from apps.core.money import (
    DiscountType,
    DocumentAmountsError,
    compute_document_amounts,
)
from apps.customers.models import Customer
from apps.inventory.selectors import effective_sale_price
from apps.sales.models import Sale, SaleItem, SaleStatus
from apps.sales.models.sale import DEFAULT_SALE_TAX_PERCENTAGE
from apps.sales.selectors import sale_amounts, sale_total

AMOUNT_SETTINGS_FIELDS = ("discount_type", "discount_value", "tax_percentage")


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
        extra_kwargs = {
            # Opcional al crear: si no viene, se usa el precio de venta
            # del producto (ver validate). Puntos 17 + 23.
            "unit_price": {"required": False},
        }

    def validate(self, attrs):
        sale = attrs.get("sale")

        if self.instance is not None:
            sale = self.instance.sale

        if sale is not None and sale.status != SaleStatus.DRAFT:
            raise serializers.ValidationError(
                "Solo se pueden modificar líneas de ventas en borrador."
            )

        if self.instance is None and attrs.get("unit_price") is None:
            default_price = effective_sale_price(attrs["product"])

            if default_price is None:
                raise serializers.ValidationError(
                    {
                        "unit_price": (
                            "Este producto no tiene precio de venta; "
                            "ingrese uno."
                        ),
                    }
                )

            attrs["unit_price"] = default_price

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
    customer_detail = CustomerSummarySerializer(
        source="customer",
        read_only=True,
    )
    items = SaleItemInlineSerializer(
        many=True,
        read_only=True,
    )
    # Montos del documento (punto 19): congelados si está confirmada o
    # anulada, en vivo si está en borrador. amounts_error explica por qué
    # vienen en null (el descuento quedó mayor que el subtotal).
    subtotal = serializers.SerializerMethodField()
    discount_amount = serializers.SerializerMethodField()
    tax_amount = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    amounts_error = serializers.SerializerMethodField()

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
            "payment_method",
            "confirmed_at",
            "confirmed_by",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
            "notes",
            "items",
            "discount_type",
            "discount_value",
            "tax_percentage",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total",
            "amounts_error",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "currency",
            "exchange_rate",
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

    def validate(self, attrs):
        if self.instance is not None and self.instance.status != SaleStatus.DRAFT:
            raise serializers.ValidationError(
                "Solo se pueden modificar ventas en borrador."
            )

        if any(field in attrs for field in AMOUNT_SETTINGS_FIELDS):
            discount_type = attrs.get(
                "discount_type",
                getattr(self.instance, "discount_type", DiscountType.AMOUNT),
            )
            discount_value = attrs.get(
                "discount_value",
                getattr(self.instance, "discount_value", 0),
            )
            tax_percentage = attrs.get(
                "tax_percentage",
                getattr(
                    self.instance,
                    "tax_percentage",
                    DEFAULT_SALE_TAX_PERCENTAGE,
                ),
            )

            if self.instance is not None:
                # Contra el subtotal de las líneas que ya tiene.
                subtotal = sale_total(self.instance)
            elif discount_type == DiscountType.AMOUNT:
                # Al crear todavía no hay líneas: solo se validan los
                # rangos, así que el subtotal alcanza justo para el monto.
                subtotal = discount_value
            else:
                subtotal = Decimal("0")

            try:
                compute_document_amounts(
                    subtotal,
                    discount_type,
                    discount_value,
                    tax_percentage,
                )
            except DocumentAmountsError as exc:
                field = (
                    "tax_percentage"
                    if "impuesto" in str(exc)
                    else "discount_value"
                )
                raise serializers.ValidationError({field: str(exc)})

        return attrs

    def create(self, validated_data):
        validated_data.setdefault(
            "tax_percentage",
            DEFAULT_SALE_TAX_PERCENTAGE,
        )

        return super().create(validated_data)

    def _amounts(self, obj):
        # Un cálculo por venta y por respuesta: los cinco campos de
        # montos lo comparten.
        cache = self.__dict__.setdefault("_amounts_cache", {})

        if obj.pk not in cache:
            try:
                cache[obj.pk] = (sale_amounts(obj), None)
            except DocumentAmountsError as exc:
                cache[obj.pk] = (None, str(exc))

        return cache[obj.pk]

    def get_subtotal(self, obj):
        amounts, _error = self._amounts(obj)

        return amounts.subtotal if amounts else None

    def get_discount_amount(self, obj):
        amounts, _error = self._amounts(obj)

        return amounts.discount_amount if amounts else None

    def get_tax_amount(self, obj):
        amounts, _error = self._amounts(obj)

        return amounts.tax_amount if amounts else None

    def get_total(self, obj):
        amounts, _error = self._amounts(obj)

        return amounts.total if amounts else None

    def get_amounts_error(self, obj):
        _amounts, error = self._amounts(obj)

        return error
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