from rest_framework import serializers

from apps.inventory.models import Supplier


class SupplierSerializer(serializers.ModelSerializer):
    name = serializers.CharField(
        max_length=150,
    )

    class Meta:
        model = Supplier
        fields = (
            "id",
            "name",
            "contact_name",
            "phone",
            "email",
            "country",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def validate_name(self, value):
        normalized = value.strip().upper()

        if not normalized:
            raise serializers.ValidationError(
                "El nombre del proveedor es obligatorio."
            )

        queryset = Supplier.objects.filter(
            name__iexact=normalized,
        )

        if self.instance is not None:
            queryset = queryset.exclude(
                pk=self.instance.pk,
            )

        if queryset.exists():
            raise serializers.ValidationError(
                "Ya existe un proveedor registrado con este nombre."
            )

        return normalized
