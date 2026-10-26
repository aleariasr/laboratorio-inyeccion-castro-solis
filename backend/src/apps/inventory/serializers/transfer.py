from rest_framework import serializers

from apps.inventory.models import (
    Branch,
    StockTransfer,
    StockTransferItem,
    StockTransferStatus,
)


def _username(user):
    return user.get_username() if user is not None else None


class BranchSerializer(serializers.ModelSerializer):
    """Sedes (punto 6): se crean desde el mismo traslado."""

    class Meta:
        model = Branch
        fields = ("id", "name", "is_active")
        # La unicidad la revisa validate_name, sin distinguir mayúsculas.
        extra_kwargs = {"name": {"validators": []}}

    def validate_name(self, value):
        name = " ".join(value.split())

        if not name:
            raise serializers.ValidationError("El nombre es obligatorio.")

        duplicate = Branch.objects.filter(name__iexact=name)

        if self.instance is not None:
            duplicate = duplicate.exclude(pk=self.instance.pk)

        if duplicate.exists():
            raise serializers.ValidationError("Ya existe una sede con ese nombre.")

        return name


def _product_detail(product):
    return {
        "id": product.id,
        "standard_code": product.standard_code,
        "own_code": product.own_code,
        "name": product.name,
        "location_code": product.storage_location.code,
        "unit_of_measure": product.unit_of_measure,
    }


class StockTransferItemSerializer(serializers.ModelSerializer):
    """
    Línea de un traslado. Solo se crea, cambia la cantidad o se borra
    mientras el traslado está en borrador; el producto no cambia (se
    borra la línea y se agrega otra).
    """

    product_detail = serializers.SerializerMethodField()

    class Meta:
        model = StockTransferItem
        fields = (
            "id",
            "stock_transfer",
            "product",
            "product_detail",
            "quantity",
        )
        # El producto repetido lo revisa validate, con un mensaje claro.
        validators = []

    def get_product_detail(self, obj):
        return _product_detail(obj.product)

    def validate(self, attrs):
        if self.instance is not None:
            for field in ("stock_transfer", "product"):
                if field in attrs and attrs[field] != getattr(self.instance, field):
                    raise serializers.ValidationError(
                        {field: "No se puede cambiar; se quita la línea y se agrega otra."}
                    )

        stock_transfer = attrs.get(
            "stock_transfer",
            getattr(self.instance, "stock_transfer", None),
        )

        if stock_transfer is not None and stock_transfer.status != StockTransferStatus.DRAFT:
            raise serializers.ValidationError(
                "Solo se modifican las líneas de un traslado en borrador."
            )

        if self.instance is None:
            product = attrs["product"]

            if not product.is_active:
                raise serializers.ValidationError(
                    {"product": "El producto está inactivo."}
                )

            if stock_transfer.items.filter(product=product).exists():
                raise serializers.ValidationError(
                    {"product": "Ese producto ya está en el traslado; se cambia su cantidad."}
                )

        return attrs


class StockTransferItemInlineSerializer(serializers.ModelSerializer):
    product_detail = serializers.SerializerMethodField()

    class Meta:
        model = StockTransferItem
        fields = ("id", "product", "product_detail", "quantity")

    def get_product_detail(self, obj):
        return _product_detail(obj.product)


class StockTransferSerializer(serializers.ModelSerializer):
    branch_detail = BranchSerializer(source="branch", read_only=True)
    items = StockTransferItemInlineSerializer(many=True, read_only=True)
    total_quantity = serializers.SerializerMethodField()
    created_by_username = serializers.SerializerMethodField()
    confirmed_by_username = serializers.SerializerMethodField()
    cancelled_by_username = serializers.SerializerMethodField()

    class Meta:
        model = StockTransfer
        fields = (
            "id",
            "branch",
            "branch_detail",
            "transfer_date",
            "status",
            "notes",
            "items",
            "total_quantity",
            "confirmed_at",
            "confirmed_by_username",
            "cancelled_at",
            "cancelled_by_username",
            "cancellation_reason",
            "created_by_username",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "confirmed_at",
            "cancelled_at",
            "cancellation_reason",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        if self.instance is not None and self.instance.status != StockTransferStatus.DRAFT:
            raise serializers.ValidationError(
                "Solo se modifica un traslado en borrador."
            )

        branch = attrs.get("branch")

        if branch is not None and not branch.is_active:
            raise serializers.ValidationError({"branch": "La sede está inactiva."})

        return attrs

    def get_total_quantity(self, obj):
        return sum(item.quantity for item in obj.items.all())

    def get_created_by_username(self, obj):
        return _username(obj.created_by)

    def get_confirmed_by_username(self, obj):
        return _username(obj.confirmed_by)

    def get_cancelled_by_username(self, obj):
        return _username(obj.cancelled_by)


class StockTransferCancellationSerializer(serializers.Serializer):
    # Obligatorio solo para un traslado confirmado (lo valida
    # cancel_stock_transfer, que sabe el estado).
    reason = serializers.CharField(
        max_length=1000,
        required=False,
        allow_blank=True,
        default="",
    )
