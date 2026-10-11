from rest_framework import serializers

from apps.core.permissions import is_module_admin
from apps.inventory.selectors import effective_sale_price

from apps.customers.models import (
    Customer,
    Injector,
    InjectorServiceRecord,
    InjectorServiceStatus,
)

from apps.customers.models import (
    Customer,
    Injector,
    InjectorServiceAccessory,
    InjectorServiceRecord,
    InjectorServiceStatus,
    ServiceType,
    ServiceTypePriceHistory,
)


# Precio, tipo de servicio y método de pago los define solo el
# Administrador (punto 25); el operario recibe, inicia y marca listo.
SERVICE_PRICING_FIELDS = ("price", "service_type", "payment_method")

SERVICE_PRICING_ONLY_ADMIN_MESSAGE = (
    "Solo el Administrador define el precio, el tipo de servicio y el "
    "método de pago."
)


class ModuleAdminContextMixin:
    """
    Decide una sola vez por serializer si quien pide es Administrador.
    En un listado DRF reutiliza la misma instancia hija para cada fila,
    así que sin la caché la consulta del grupo se repetiría por fila.
    Sin request en el contexto responde False: el lado seguro es ocultar.
    """

    def _is_module_admin(self):
        if not hasattr(self, "_is_module_admin_cache"):
            request = self.context.get("request")
            self._is_module_admin_cache = is_module_admin(
                request.user if request is not None else None,
            )

        return self._is_module_admin_cache


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
        value = value.strip().upper()

        if value:
            queryset = Customer.objects.filter(identification=value)

            if self.instance is not None:
                queryset = queryset.exclude(pk=self.instance.pk)

            if queryset.exists():
                raise serializers.ValidationError(
                    "Ya existe un cliente con esa identificación."
                )

        return value

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

    def validate(self, attrs):
        customer = attrs.get(
            "customer",
            self.instance.customer if self.instance else None,
        )
        injector_number = attrs.get(
            "injector_number",
            self.instance.injector_number if self.instance else None,
        )

        if customer is not None and injector_number:
            queryset = Injector.objects.filter(
                customer=customer,
                injector_number=injector_number,
            )

            if self.instance is not None:
                queryset = queryset.exclude(pk=self.instance.pk)

            if queryset.exists():
                raise serializers.ValidationError(
                    {
                        "injector_number": [
                            "Este cliente ya tiene un inyector con ese número.",
                        ]
                    }
                )

        return attrs


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


class ServiceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceType
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
                "El nombre del tipo de servicio es obligatorio."
            )

        queryset = ServiceType.objects.filter(name=value)

        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(
                "Ya existe un tipo de servicio con este nombre."
            )

        return value


class InjectorServiceRecordSerializer(
    ModuleAdminContextMixin,
    serializers.ModelSerializer,
):
    injector_detail = InjectorSummarySerializer(
        source="injector",
        read_only=True,
    )
    service_type_detail = ServiceTypeSerializer(
        source="service_type",
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
            "inductance",
            "isolation",
            "price",
            "payment_method",
            "service_type",
            "service_type_detail",
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

        if not self._is_module_admin():
            errors = {}

            for field_name in SERVICE_PRICING_FIELDS:
                if field_name not in attrs:
                    continue

                current = (
                    getattr(self.instance, field_name)
                    if self.instance is not None
                    else InjectorServiceRecord._meta.get_field(
                        field_name,
                    ).get_default()
                )

                # Reenviar el valor que ya tiene no es un cambio.
                if attrs[field_name] != current:
                    errors[field_name] = SERVICE_PRICING_ONLY_ADMIN_MESSAGE

            if errors:
                raise serializers.ValidationError(errors)

        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)

        # El operario no ve cuánto se cobra (punto 25).
        if not self._is_module_admin():
            data["price"] = None
            data["payment_method"] = None

        return data


class ServiceTypePriceHistorySerializer(serializers.ModelSerializer):
    service_type_detail = ServiceTypeSerializer(
        source="service_type",
        read_only=True,
    )

    class Meta:
        model = ServiceTypePriceHistory
        fields = (
            "id",
            "service_type",
            "service_type_detail",
            "service_record",
            "price",
            "charged_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class InjectorServiceAccessorySerializer(
    ModuleAdminContextMixin,
    serializers.ModelSerializer,
):
    product_detail = serializers.SerializerMethodField()

    class Meta:
        model = InjectorServiceAccessory
        fields = (
            "id",
            "service_record",
            "product",
            "product_detail",
            "quantity",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def get_product_detail(self, obj):
        # El importe de los accesorios forma parte del cobro del
        # servicio: solo el Administrador lo ve (punto 25).
        price = (
            effective_sale_price(obj.product)
            if self._is_module_admin()
            else None
        )

        return {
            "id": obj.product_id,
            "standard_code": obj.product.standard_code,
            "name": obj.product.name,
            "effective_sale_price": str(price) if price is not None else None,
        }

    def validate(self, attrs):
        service_record = attrs.get("service_record")
        product = attrs.get("product")

        if service_record.status in {
            InjectorServiceStatus.DELIVERED,
            InjectorServiceStatus.CANCELLED,
        }:
            raise serializers.ValidationError(
                "No se pueden modificar accesorios de servicios entregados o anulados."
            )

        if InjectorServiceAccessory.objects.filter(
            service_record=service_record,
            product=product,
        ).exists():
            raise serializers.ValidationError(
                "Este producto ya fue registrado como accesorio en el servicio."
            )

        return attrs