from django.core.validators import RegexValidator
from rest_framework import serializers

from apps.inventory.models import (
    Product,
    ProductReference,
    StorageLocation,
)
from apps.inventory.selectors import current_stock


LOCATION_CODE_VALIDATOR = RegexValidator(
    regex=r"^[A-Z][1-9][0-9]{0,3}$",
    message="El código de ubicación debe tener un formato como A124.",
)


class StorageLocationSerializer(serializers.ModelSerializer):
    code = serializers.CharField(
        max_length=5,
        validators=[],
        help_text="Ejemplo: A124",
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

    def validate_description(self, value):
        return value.strip()

    def get_product_detail(self, obj):
        return {
            "id": obj.product_id,
            "standard_code": obj.product.standard_code,
            "name": obj.product.name,
            "description": obj.product.description,
        }
