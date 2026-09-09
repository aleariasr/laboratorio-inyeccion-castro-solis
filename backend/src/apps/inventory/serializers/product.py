from rest_framework import serializers

from apps.inventory.models import (
    Product,
    StorageLocation,
)
from apps.inventory.models.product import LOCATION_CODE_VALIDATOR
from apps.inventory.selectors import (
    current_stock,
    effective_sale_price,
    latest_suggested_price,
    variant_family,
)


class StorageLocationSerializer(serializers.ModelSerializer):
    code = serializers.CharField(
        max_length=10,
        validators=[],
        help_text="Letras y números, sin espacios. Ejemplo: A124 o BODEGA1.",
    )

    class Meta:
        model = StorageLocation
        fields = (
            "id",
            "code",
            "description",
            "is_active",
        )

    def validate_code(self, value):
        normalized_code = value.strip().upper()

        LOCATION_CODE_VALIDATOR(normalized_code)

        queryset = StorageLocation.objects.filter(
            code=normalized_code,
        )

        if self.instance is not None:
            queryset = queryset.exclude(
                pk=self.instance.pk,
            )

        if queryset.exists():
            raise serializers.ValidationError(
                "Ya existe una ubicación con este código."
            )

        return normalized_code

    def validate_description(self, value):
        return value.strip()

    def validate(self, attrs):
        attrs = super().validate(attrs)

        if self.instance is None:
            return attrs

        resulting_is_active = attrs.get(
            "is_active",
            self.instance.is_active,
        )

        is_being_deactivated = (
            self.instance.is_active
            and not resulting_is_active
        )

        if (
            is_being_deactivated
            and self.instance.products.filter(
                is_active=True,
            ).exists()
        ):
            raise serializers.ValidationError(
                {
                    "is_active": (
                        "No puede inactivar una ubicación "
                        "que todavía tiene productos activos."
                    )
                }
            )

        return attrs


class ProductSerializer(serializers.ModelSerializer):
    current_stock = serializers.SerializerMethodField()
    latest_suggested_price = serializers.SerializerMethodField()
    effective_sale_price = serializers.SerializerMethodField()
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
            "custom_sale_price",
            "latest_suggested_price",
            "effective_sale_price",
            "variant_kind",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
            "current_stock",
            "latest_suggested_price",
            "effective_sale_price",
        )
        extra_kwargs = {
            "standard_code": {
                "validators": [],
            },
        }

    def validate_standard_code(self, value):
        normalized_code = value.strip().upper()

        if not normalized_code:
            raise serializers.ValidationError(
                "El código estándar es obligatorio."
            )

        queryset = Product.objects.filter(
            standard_code=normalized_code,
        )

        if self.instance is not None:
            queryset = queryset.exclude(
                pk=self.instance.pk,
            )

        if queryset.exists():
            raise serializers.ValidationError(
                "Ya existe un producto con este código estándar."
            )

        return normalized_code

    def validate_name(self, value):
        normalized_name = value.strip()

        if not normalized_name:
            raise serializers.ValidationError(
                "El nombre del producto es obligatorio."
            )

        return normalized_name

    def validate_description(self, value):
        return value.strip()

    def validate_unit_of_measure(self, value):
        normalized_unit = value.strip().lower()

        if not normalized_unit:
            raise serializers.ValidationError(
                "La unidad de medida es obligatoria."
            )

        return normalized_unit

    def validate_storage_location(self, value):
        if not value.is_active:
            raise serializers.ValidationError(
                "No puede asignar el producto a una ubicación inactiva."
            )

        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        if self.instance is None:
            return attrs

        was_active = self.instance.is_active
        resulting_is_active = attrs.get(
            "is_active",
            was_active,
        )

        resulting_location = attrs.get(
            "storage_location",
            self.instance.storage_location,
        )

        is_being_reactivated = (
            not was_active
            and resulting_is_active
        )

        if (
            is_being_reactivated
            and not resulting_location.is_active
        ):
            raise serializers.ValidationError(
                {
                    "storage_location": (
                        "No puede activar un producto "
                        "ubicado en una ubicación inactiva."
                    )
                }
            )

        location_is_changing = (
            "storage_location" in attrs
            and resulting_location != self.instance.storage_location
        )

        if location_is_changing:
            if variant_family(self.instance).exists():
                raise serializers.ValidationError(
                    {
                        "storage_location": (
                            "Este producto comparte código con otras "
                            "variantes; todas deben permanecer en la "
                            "misma ubicación."
                        )
                    }
                )

        return attrs

    def get_current_stock(self, obj):
        if hasattr(obj, "current_stock"):
            return obj.current_stock

        return current_stock(obj)

    def get_latest_suggested_price(self, obj):
        if hasattr(obj, "latest_suggested_price"):
            value = obj.latest_suggested_price
        else:
            value = latest_suggested_price(obj)

        return str(value) if value is not None else None

    def get_effective_sale_price(self, obj):
        value = effective_sale_price(obj)

        return str(value) if value is not None else None


class ProductVariantCreateSerializer(serializers.ModelSerializer):
    """
    Crea una nueva variante (original/genérico/otro) de un producto
    existente. standard_code y storage_location NO son campos de
    este serializer: siempre se heredan del producto padre en la
    vista (ProductViewSet.add_variant), así es imposible crear una
    variante con código o ubicación distintos de su familia.
    """

    # Declarado explícito (sin usar el default="unidad" del modelo):
    # si no se manda, la vista lo completa con el unit_of_measure del
    # producto padre, no con el default genérico del modelo.
    unit_of_measure = serializers.CharField(required=False)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "description",
            "variant_kind",
            "unit_of_measure",
            "minimum_stock",
            "custom_sale_price",
        )

    def validate_name(self, value):
        normalized_name = value.strip()

        if not normalized_name:
            raise serializers.ValidationError(
                "El nombre del producto es obligatorio."
            )

        return normalized_name

    def validate_description(self, value):
        return value.strip()

    def validate_unit_of_measure(self, value):
        normalized_unit = value.strip().lower()

        if not normalized_unit:
            raise serializers.ValidationError(
                "La unidad de medida es obligatoria."
            )

        return normalized_unit
