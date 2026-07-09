from rest_framework import serializers

from apps.customers.models import (
    Customer,
    Injector,
    InjectorServiceRecord,
    InjectorServiceStatus,
)


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = (
            "id",
            "customer_type",
            "display_name",
            "phone",
            "email",
            "identification",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def validate_display_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "El nombre del cliente es obligatorio."
            )

        return value

    def validate_identification(self, value):
        return value.strip().upper()

    def validate_phone(self, value):
        return value.strip()


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


class InjectorSerializer(serializers.ModelSerializer):
    customer_detail = CustomerSummarySerializer(
        source="customer",
        read_only=True,
    )

    class Meta:
        model = Injector
        fields = (
            "id",
            "customer",
            "customer_detail",
            "injector_number",
            "description",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def validate_injector_number(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "El número de inyector es obligatorio."
            )

        return value.upper()


class InjectorSummarySerializer(serializers.ModelSerializer):
    customer_detail = CustomerSummarySerializer(
        source="customer",
        read_only=True,
    )

    class Meta:
        model = Injector
        fields = (
            "id",
            "customer",
            "customer_detail",
            "injector_number",
            "description",
            "is_active",
        )


class InjectorServiceRecordSerializer(serializers.ModelSerializer):
    injector_detail = InjectorSummarySerializer(
        source="injector",
        read_only=True,
    )

    class Meta:
        model = InjectorServiceRecord
        fields = (
            "id",
            "injector",
            "injector_detail",
            "received_at",
            "delivered_at",
            "resistance",
            "leakage",
            "notes_before",
            "notes_after",
            "observations",
            "status",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "delivered_at",
            "status",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        if (
            self.instance is not None
            and self.instance.status
            in {
                InjectorServiceStatus.DELIVERED,
                InjectorServiceStatus.CANCELLED,
            }
        ):
            raise serializers.ValidationError(
                "No se pueden modificar servicios entregados o anulados."
            )

        return attrs