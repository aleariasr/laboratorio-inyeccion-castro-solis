from django.db import transaction
from rest_framework import serializers

from apps.core.money import DocumentAmountsError, compute_document_amounts
from apps.core.permissions import is_module_admin
from apps.customers.selectors import service_amounts
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
    ServiceTypeAccessory,
    ServiceTypePriceHistory,
)
from apps.inventory.models import Product


# Precio, tipo de servicio, método de pago, descuento e impuesto los
# define solo el Administrador (puntos 25 y 26); el operario recibe,
# inicia y marca listo.
SERVICE_AMOUNT_SETTINGS_FIELDS = (
    "discount_type",
    "discount_value",
    "tax_percentage",
)
SERVICE_PRICING_FIELDS = (
    "price",
    "service_type",
    "payment_method",
    *SERVICE_AMOUNT_SETTINGS_FIELDS,
)

# Lo que el operario recibe vacío: todo lo que dice cuánto se cobra.
SERVICE_HIDDEN_FROM_OPERATOR_FIELDS = (
    "price",
    "payment_method",
    "discount_type",
    "discount_value",
    "tax_percentage",
    "subtotal",
    "discount_amount",
    "tax_amount",
    "total",
    "amounts_error",
)

SERVICE_PRICING_ONLY_ADMIN_MESSAGE = (
    "Solo el Administrador define el precio, el tipo de servicio, el "
    "método de pago, el descuento y el impuesto."
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


MAX_SERVICE_TYPE_KIT_ITEMS = 50


def validate_service_type_name(value, instance=None):
    value = value.strip().upper()

    if not value:
        raise serializers.ValidationError(
            "El nombre del tipo de servicio es obligatorio."
        )

    queryset = ServiceType.objects.filter(name=value)

    if instance is not None:
        queryset = queryset.exclude(pk=instance.pk)

    if queryset.exists():
        raise serializers.ValidationError(
            "Ya existe un tipo de servicio con este nombre."
        )

    return value


class ServiceTypeSummarySerializer(serializers.ModelSerializer):
    """
    Lo que se muestra del tipo dentro de un servicio: sin precio ni kit
    (y sin consultas extra por fila en el listado de servicios).
    """

    class Meta:
        model = ServiceType
        fields = (
            "id",
            "name",
            "description",
            "is_active",
        )
        read_only_fields = fields


class ServiceTypeKitItemSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True),
        error_messages={
            "does_not_exist": "El producto no existe o está inactivo.",
        },
    )
    product_detail = serializers.SerializerMethodField()

    class Meta:
        model = ServiceTypeAccessory
        fields = (
            "id",
            "product",
            "product_detail",
            "quantity",
        )
        read_only_fields = ("id",)

    def get_product_detail(self, obj):
        product = obj.product

        return {
            "id": product.id,
            "standard_code": product.standard_code,
            "own_code": product.own_code,
            "name": product.name,
        }


class ServiceTypeSerializer(
    ModuleAdminContextMixin,
    serializers.ModelSerializer,
):
    """
    Tipo de servicio completo (punto 1A del plan del 2026-10-22): nombre,
    descripción, precio de mano de obra y kit de accesorios.

    El precio de mano de obra solo lo ve el Administrador (punto 25): para
    los demás sale en null. El kit se escribe entero: la lista enviada
    reemplaza a la anterior.
    """

    kit_items = ServiceTypeKitItemSerializer(many=True, required=False)

    class Meta:
        model = ServiceType
        fields = (
            "id",
            "name",
            "description",
            "default_labor_price",
            "kit_items",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )

    def validate_name(self, value):
        return validate_service_type_name(value, self.instance)

    def validate_description(self, value):
        return value.strip()

    def validate_kit_items(self, value):
        if len(value) > MAX_SERVICE_TYPE_KIT_ITEMS:
            raise serializers.ValidationError(
                "El kit no puede tener más de "
                f"{MAX_SERVICE_TYPE_KIT_ITEMS} productos."
            )

        product_ids = [item["product"].id for item in value]

        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError(
                "Cada producto puede estar una sola vez en el kit; "
                "para más unidades, aumente su cantidad."
            )

        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)

        if not self._is_module_admin():
            data["default_labor_price"] = None

        return data

    def _replace_kit(self, service_type, kit_items):
        user = getattr(self.context.get("request"), "user", None)

        service_type.kit_items.all().delete()

        ServiceTypeAccessory.objects.bulk_create(
            [
                ServiceTypeAccessory(
                    service_type=service_type,
                    product=item["product"],
                    quantity=item["quantity"],
                    created_by=user,
                    updated_by=user,
                )
                for item in kit_items
            ]
        )

    @transaction.atomic
    def create(self, validated_data):
        kit_items = validated_data.pop("kit_items", [])
        service_type = super().create(validated_data)
        self._replace_kit(service_type, kit_items)

        return service_type

    @transaction.atomic
    def update(self, instance, validated_data):
        kit_items = validated_data.pop("kit_items", None)
        service_type = super().update(instance, validated_data)

        # Sin kit_items en la solicitud (por ejemplo, solo cambiar el
        # nombre), el kit queda como estaba.
        if kit_items is not None:
            self._replace_kit(service_type, kit_items)

        return service_type


class InjectorServiceRecordSerializer(
    ModuleAdminContextMixin,
    serializers.ModelSerializer,
):
    injector_detail = InjectorSummarySerializer(
        source="injector",
        read_only=True,
    )
    service_type_detail = ServiceTypeSummarySerializer(
        source="service_type",
        read_only=True,
    )
    # Montos del documento (punto 26), mismo criterio que la venta:
    # congelados si está entregado, en vivo antes. price es el subtotal.
    subtotal = serializers.SerializerMethodField()
    discount_amount = serializers.SerializerMethodField()
    tax_amount = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    amounts_error = serializers.SerializerMethodField()

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
            "discount_type",
            "discount_value",
            "tax_percentage",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total",
            "amounts_error",
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

        if any(
            field_name in attrs
            for field_name in ("price", *SERVICE_AMOUNT_SETTINGS_FIELDS)
        ):
            self._validate_amounts(attrs)

        return attrs

    def _validate_amounts(self, attrs):
        def resulting(field_name):
            if field_name in attrs:
                return attrs[field_name]

            if self.instance is not None:
                return getattr(self.instance, field_name)

            return InjectorServiceRecord._meta.get_field(
                field_name,
            ).get_default()

        price = resulting("price")

        if price is None:
            # Sin precio no hay contra qué comparar el descuento: solo
            # rangos. El descuento se vuelve a validar al poner precio y
            # al entregar.
            price = resulting("discount_value") or 0

        try:
            compute_document_amounts(
                price,
                resulting("discount_type"),
                resulting("discount_value"),
                resulting("tax_percentage"),
            )
        except DocumentAmountsError as exc:
            field_name = (
                "tax_percentage"
                if "impuesto" in str(exc)
                else "discount_value"
            )
            raise serializers.ValidationError({field_name: str(exc)})

    def _amounts(self, obj):
        # Un cálculo por servicio y por respuesta: los cinco campos de
        # montos lo comparten.
        cache = self.__dict__.setdefault("_amounts_cache", {})

        if obj.pk not in cache:
            try:
                cache[obj.pk] = (service_amounts(obj), None)
            except DocumentAmountsError as exc:
                cache[obj.pk] = (None, str(exc))

        return cache[obj.pk]

    def get_subtotal(self, obj):
        amounts, _error = self._amounts(obj)

        return amounts.subtotal if amounts else None

    def get_discount_amount(self, obj):
        amounts, _error = self._amounts(obj)

        return amounts.discount_amount if amounts else None

    def get_tax_amount(self, obj):
        amounts, _error = self._amounts(obj)

        return amounts.tax_amount if amounts else None

    def get_total(self, obj):
        amounts, _error = self._amounts(obj)

        return amounts.total if amounts else None

    def get_amounts_error(self, obj):
        _amounts, error = self._amounts(obj)

        return error

    def to_representation(self, instance):
        data = super().to_representation(instance)

        # El operario no ve cuánto se cobra (puntos 25 y 26).
        if not self._is_module_admin():
            for field_name in SERVICE_HIDDEN_FROM_OPERATOR_FIELDS:
                data[field_name] = None

        return data


class ServiceTypePriceHistorySerializer(serializers.ModelSerializer):
    service_type_detail = ServiceTypeSummarySerializer(
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