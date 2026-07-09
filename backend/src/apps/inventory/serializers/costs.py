from rest_framework import serializers

from apps.inventory.models import (
    ImportCost,
    ImportCostCategory,
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
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def get_purchase_detail(self, obj):
        return {
            "id": obj.purchase_id,
            "invoice_number": obj.purchase.invoice_number,
            "supplier": obj.purchase.supplier.name,
            "currency": obj.purchase.currency,
            "status": obj.purchase.status,
        }