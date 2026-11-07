from rest_framework import serializers

from apps.inventory.exchange_rates import (
    CRC_EXCHANGE_RATE,
    USD_EXCHANGE_RATE_RANGE_MESSAGE,
    USD_EXCHANGE_RATE_REQUIRED_MESSAGE,
    is_valid_usd_exchange_rate,
)
from apps.inventory.models import (
    Currency,
    ImportCost,
    ImportCostCategory,
    ProductCostHistory,
    PurchaseStatus,
)


class ImportCostCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportCostCategory
        fields = (
            "id",
            "name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def validate_name(self, value):
        value = value.strip().upper()

        if not value:
            raise serializers.ValidationError(
                "El nombre de la categoría es obligatorio."
            )

        queryset = ImportCostCategory.objects.filter(name=value)

        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(
                "Ya existe una categoría con este nombre."
            )

        return value


class ImportCostSerializer(serializers.ModelSerializer):
    category_detail = ImportCostCategorySerializer(
        source="category",
        read_only=True,
    )
    purchase_detail = serializers.SerializerMethodField()

    class Meta:
        model = ImportCost
        fields = (
            "id",
            "purchase",
            "purchase_detail",
            "category",
            "category_detail",
            "description",
            "amount",
            "currency",
            "exchange_rate",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        """
        exchange_rate de un costo es colones por dólar, igual que el de la
        compra, y depende solo de la moneda del costo (auditoría del
        2026-11-07):

        - costo en colones: 1, no hay nada que convertir;
        - costo en dólares: el tipo de cambio con que se pagó ese costo.
          Si no viene, se usa el del costo (si ya era en dólares) o el de
          la compra (si es en dólares).

        Antes un costo en la moneda de la compra guardaba 1 y uno en la
        otra moneda guardaba el tipo de cambio para pasarlo a la moneda de
        la compra; al pasar la compra de una moneda a otra esos valores
        quedaban al revés (₡50 000 con tipo de cambio 1 sumaban US$50 000).
        """

        purchase = attrs.get("purchase")

        if self.instance is not None:
            if purchase is not None and purchase != self.instance.purchase:
                raise serializers.ValidationError(
                    {"purchase": ["Un costo no se cambia de compra."]}
                )

            purchase = self.instance.purchase

        if purchase is not None and purchase.status != PurchaseStatus.DRAFT:
            # Confirmar es definitivo: un costo que llegue después obliga a
            # anular y volver a registrar la compra.
            raise serializers.ValidationError(
                "Solo se pueden modificar costos de compras en borrador."
            )

        currency = attrs.get(
            "currency",
            self.instance.currency if self.instance is not None else None,
        )

        if currency == Currency.CRC:
            attrs["exchange_rate"] = CRC_EXCHANGE_RATE
        elif currency == Currency.USD:
            exchange_rate = attrs.get("exchange_rate")

            if (
                exchange_rate is None
                and self.instance is not None
                and self.instance.currency == Currency.USD
            ):
                exchange_rate = self.instance.exchange_rate

            if (
                exchange_rate is None
                and purchase is not None
                and purchase.currency == Currency.USD
            ):
                exchange_rate = purchase.exchange_rate

            if exchange_rate is None:
                raise serializers.ValidationError(
                    {"exchange_rate": [USD_EXCHANGE_RATE_REQUIRED_MESSAGE]}
                )

            if not is_valid_usd_exchange_rate(exchange_rate):
                raise serializers.ValidationError(
                    {"exchange_rate": [USD_EXCHANGE_RATE_RANGE_MESSAGE]}
                )

            attrs["exchange_rate"] = exchange_rate

        return attrs

    def get_purchase_detail(self, obj):
        return {
            "id": obj.purchase_id,
            "invoice_number": obj.purchase.invoice_number,
            "supplier": obj.purchase.supplier.name,
            "currency": obj.purchase.currency,
            "status": obj.purchase.status,
        }

class ProductCostHistorySerializer(serializers.ModelSerializer):
    product_detail = serializers.SerializerMethodField()
    purchase_detail = serializers.SerializerMethodField()

    class Meta:
        model = ProductCostHistory
        fields = (
            "id",
            "product",
            "product_detail",
            "purchase",
            "purchase_detail",
            "original_unit_cost",
            "cost_factor",
            "final_unit_cost",
            "currency",
            "exchange_rate",
            "margin_percentage",
            "suggested_price",
            "calculated_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_product_detail(self, obj):
        return {
            "id": obj.product_id,
            "standard_code": obj.product.standard_code,
            "name": obj.product.name,
        }

    def get_purchase_detail(self, obj):
        return {
            "id": obj.purchase_id,
            "invoice_number": obj.purchase.invoice_number,
            "supplier": obj.purchase.supplier.name,
            "currency": obj.purchase.currency,
        }


class PurchaseCostCalculationSerializer(serializers.Serializer):
    margin_percentage = serializers.DecimalField(
        max_digits=8,
        decimal_places=4,
        min_value=0,
    )