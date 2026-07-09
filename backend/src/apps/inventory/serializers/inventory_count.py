from rest_framework import serializers

from apps.inventory.models import (
    InventoryCount,
    InventoryCountItem,
    InventoryCountStatus,
)
from apps.inventory.serializers.product import ProductSerializer


class InventoryCountSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryCount
        fields = (
            "id",
            "reference",
            "count_date",
            "status",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "created_at",
            "updated_at",
        )

    def validate_reference(self, value):
        value = value.strip().upper()

        if not value:
            raise serializers.ValidationError(
                "La referencia del conteo es obligatoria."
            )

        queryset = InventoryCount.objects.filter(reference=value)

        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(
                "Ya existe un conteo con esta referencia."
            )

        return value

    def validate(self, attrs):
        if (
            self.instance is not None
            and self.instance.status != InventoryCountStatus.DRAFT
        ):
            raise serializers.ValidationError(
                "No se pueden modificar conteos aprobados o anulados."
            )

        return attrs


class InventoryCountItemSerializer(serializers.ModelSerializer):
    product_detail = ProductSerializer(
        source="product",
        read_only=True,
    )

    class Meta:
        model = InventoryCountItem
        fields = (
            "id",
            "inventory_count",
            "product",
            "product_detail",
            "counted_quantity",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        inventory_count = attrs.get(
            "inventory_count",
            self.instance.inventory_count if self.instance else None,
        )
        product = attrs.get(
            "product",
            self.instance.product if self.instance else None,
        )

        if inventory_count.status != InventoryCountStatus.DRAFT:
            raise serializers.ValidationError(
                "No se pueden modificar líneas de conteos aprobados o anulados."
            )

        queryset = InventoryCountItem.objects.filter(
            inventory_count=inventory_count,
            product=product,
        )

        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(
                "Este producto ya está registrado en el conteo."
            )

        return attrs