from decimal import Decimal

from rest_framework import serializers

from apps.cash.models import CashClosing
from apps.cash.selectors import week_start_for
from apps.core.money import (
    DiscountType,
    money_text,
    DocumentAmountsError,
    compute_document_amounts,
)
from apps.customers.models import Customer
from apps.inventory.selectors import effective_sale_price
from apps.sales.models import Sale, SaleItem, SaleStatus
from apps.sales.models.sale import DEFAULT_SALE_TAX_PERCENTAGE
from apps.sales.selectors import sale_amounts, sale_total
from apps.sales.services.sale import sale_date_error

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
        # El producto repetido lo revisa validate, con un mensaje claro y
        # después de ver si la venta sigue en borrador. El validador que
        # DRF genera del UniqueConstraint corría antes y respondía "Los
        # campos sale, product deben formar un conjunto único."
        # (auditoría integral del 2026-11-07).
        validators = []

    def validate(self, attrs):
        sale = attrs.get("sale")

        if self.instance is not None:
            # Mover la línea a otra venta la dejaba en una confirmada sin
            # salida de inventario (pasada previa a la 2.5.0).
            if sale is not None and sale != self.instance.sale:
                raise serializers.ValidationError(
                    {"sale": "Una línea no se cambia de venta."}
                )

            sale = self.instance.sale

        if sale is not None and sale.status != SaleStatus.DRAFT:
            raise serializers.ValidationError(
                "Solo se pueden modificar líneas de ventas en borrador."
            )

        product = attrs.get(
            "product",
            self.instance.product if self.instance is not None else None,
        )

        if sale is not None and product is not None:
            duplicates = SaleItem.objects.filter(sale=sale, product=product)

            if self.instance is not None:
                duplicates = duplicates.exclude(pk=self.instance.pk)

            if duplicates.exists():
                raise serializers.ValidationError(
                    {
                        "product": (
                            "Ese producto ya está en la venta; se cambia la "
                            "cantidad de su línea."
                        )
                    }
                )

        if self.instance is None and attrs.get("unit_price") is None:
            default_price = effective_sale_price(attrs["product"])

            if default_price is None:
                raise serializers.ValidationError(
                    {
                        "unit_price": (
                            "Este producto no tiene precio de venta; "
                            "el precio unitario es obligatorio."
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
        return money_text(obj.quantity * obj.unit_price)


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
        return money_text(obj.quantity * obj.unit_price)


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
    # Decisión P2 de la auditoría integral del 2026-11-07: anular una
    # venta de una semana ya cerrada se permite, pero la pantalla avisa
    # que el dinero devuelto no se resta de ningún cierre.
    in_closed_cash_week = serializers.SerializerMethodField()

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
            "in_closed_cash_week",
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

    def validate_sale_date(self, value):
        # Mismo criterio que al confirmar (sale_date_error): se avisa al
        # guardar el borrador, no recién al confirmarlo.
        error = sale_date_error(value)

        if error:
            raise serializers.ValidationError(error)

        return value

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

        return money_text(amounts.subtotal) if amounts else None

    def get_discount_amount(self, obj):
        amounts, _error = self._amounts(obj)

        return money_text(amounts.discount_amount) if amounts else None

    def get_tax_amount(self, obj):
        amounts, _error = self._amounts(obj)

        return money_text(amounts.tax_amount) if amounts else None

    def get_total(self, obj):
        amounts, _error = self._amounts(obj)

        return money_text(amounts.total) if amounts else None

    def get_amounts_error(self, obj):
        _amounts, error = self._amounts(obj)

        return error

    def get_in_closed_cash_week(self, obj):
        # Una consulta por respuesta, no una por venta: los cierres son
        # uno por semana, la tabla es chica.
        closed_weeks = self.__dict__.get("_closed_weeks_cache")

        if closed_weeks is None:
            closed_weeks = set(
                CashClosing.objects.values_list("week_start", flat=True)
            )
            self.__dict__["_closed_weeks_cache"] = closed_weeks

        return week_start_for(obj.sale_date) in closed_weeks
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