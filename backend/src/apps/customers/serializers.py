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
    ServiceChargeLine,
    ServiceType,
)


# Precio, tipo de servicio, método de pago, descuento e impuesto los
# define solo el Administrador (puntos 25 y 26); el operario recibe,
# inicia y marca listo.
SERVICE_AMOUNT_SETTINGS_FIELDS = (
    "discount_type",
    "discount_value",
    "tax_percentage",
)
# price ya no está: es de solo lectura, la suma de líneas de cobro y
# accesorios (punto 3 + 1B del plan del 2026-10-22).
SERVICE_PRICING_FIELDS = (
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
    Lo que se muestra del tipo dentro de un servicio: sin precio
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


class ServiceTypeSerializer(
    ModuleAdminContextMixin,
    serializers.ModelSerializer,
):
    """
    Tipo de servicio completo (punto 1A del plan del 2026-10-22): nombre,
    descripción y precio de mano de obra, que solo ve el Administrador
    (punto 25): para los demás sale en null.
    """

    class Meta:
        model = ServiceType
        fields = (
            "id",
            "name",
            "description",
            "default_labor_price",
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

    def to_representation(self, instance):
        data = super().to_representation(instance)

        if not self._is_module_admin():
            data["default_labor_price"] = None

        return data


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
            "price",
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
            for field_name in SERVICE_AMOUNT_SETTINGS_FIELDS
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


# Punto 1C: tope de inyectores por recepción (un vehículo trae pocos; el
# tope solo evita un envío desproporcionado).
MAX_RECEPTION_INJECTORS = 20


class ServiceReceptionItemSerializer(serializers.Serializer):
    injector = serializers.PrimaryKeyRelatedField(
        queryset=Injector.objects.select_related("customer"),
    )
    # Lo que reporta el cliente de este inyector.
    notes_before = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )


class ServiceReceptionSerializer(ModuleAdminContextMixin, serializers.Serializer):
    """
    Recepción de varios inyectores del mismo cliente a la vez (punto 1C del
    plan del 2026-10-22): un servicio por inyector, con la misma fecha y
    tipo de servicio. El tipo lo elige solo el Administrador (punto 25).
    """

    received_at = serializers.DateTimeField()
    service_type = serializers.PrimaryKeyRelatedField(
        queryset=ServiceType.objects.all(),
        required=False,
        allow_null=True,
        default=None,
    )
    items = ServiceReceptionItemSerializer(many=True)

    def validate_service_type(self, value):
        if value is None:
            return value

        if not self._is_module_admin():
            raise serializers.ValidationError(SERVICE_PRICING_ONLY_ADMIN_MESSAGE)

        if not value.is_active:
            raise serializers.ValidationError("El tipo de servicio está inactivo.")

        return value

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("Falta al menos un inyector.")

        if len(items) > MAX_RECEPTION_INJECTORS:
            raise serializers.ValidationError(
                f"Una recepción lleva hasta {MAX_RECEPTION_INJECTORS} inyectores."
            )

        injectors = [item["injector"] for item in items]

        if len({injector.id for injector in injectors}) != len(injectors):
            raise serializers.ValidationError("Hay un inyector repetido.")

        inactive = [injector.injector_number for injector in injectors if not injector.is_active]

        if inactive:
            raise serializers.ValidationError(
                "Estos inyectores están inactivos: " + ", ".join(inactive) + "."
            )

        if len({injector.customer_id for injector in injectors}) > 1:
            raise serializers.ValidationError(
                "Los inyectores de una recepción son todos del mismo cliente."
            )

        return items


ACCESSORY_PRICE_ONLY_ADMIN_MESSAGE = (
    "Solo el Administrador define el precio de los accesorios."
)

_LOCKED_SERVICE_STATUSES = {
    InjectorServiceStatus.DELIVERED,
    InjectorServiceStatus.CANCELLED,
}


class InjectorServiceAccessorySerializer(
    ModuleAdminContextMixin,
    serializers.ModelSerializer,
):
    """
    Accesorio usado en un servicio. Desde el punto 3 + 1B del plan del
    2026-10-22 se puede editar (cantidad, precio, notas; el producto no) y
    tiene precio fijo por unidad (unit_price), que solo ve y define el
    Administrador. Si no lo manda, se usa el precio de venta del producto.
    """

    product_detail = serializers.SerializerMethodField()
    amount = serializers.SerializerMethodField()

    class Meta:
        model = InjectorServiceAccessory
        fields = (
            "id",
            "service_record",
            "product",
            "product_detail",
            "quantity",
            "unit_price",
            "amount",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "unit_price": {"required": False},
        }

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
            "own_code": obj.product.own_code,
            "name": obj.product.name,
            "effective_sale_price": str(price) if price is not None else None,
        }

    def get_amount(self, obj):
        return str(obj.unit_price * obj.quantity)

    def to_representation(self, instance):
        data = super().to_representation(instance)

        if not self._is_module_admin():
            data["unit_price"] = None
            data["amount"] = None

        return data

    def validate(self, attrs):
        if "unit_price" in attrs and not self._is_module_admin():
            raise serializers.ValidationError(
                {"unit_price": ACCESSORY_PRICE_ONLY_ADMIN_MESSAGE}
            )

        if self.instance is not None:
            # Al editar no se cambia de producto ni de servicio: eso es
            # quitar el accesorio y agregar otro.
            for field_name in ("service_record", "product"):
                if (
                    field_name in attrs
                    and attrs[field_name] != getattr(self.instance, field_name)
                ):
                    raise serializers.ValidationError(
                        {
                            field_name: (
                                "No se puede cambiar; quite el accesorio y "
                                "agregue otro."
                            )
                        }
                    )

            service_record = self.instance.service_record
        else:
            service_record = attrs.get("service_record")

        if service_record.status in _LOCKED_SERVICE_STATUSES:
            raise serializers.ValidationError(
                "No se pueden modificar accesorios de servicios entregados o anulados."
            )

        if (
            self.instance is None
            and InjectorServiceAccessory.objects.filter(
                service_record=service_record,
                product=attrs.get("product"),
            ).exists()
        ):
            raise serializers.ValidationError(
                "Este producto ya fue registrado como accesorio en el servicio; "
                "cambie su cantidad."
            )

        return attrs


class ServiceChargeLineSerializer(serializers.ModelSerializer):
    """
    Línea de cobro de un servicio (punto 3 + 1B del plan del 2026-10-22):
    "Mano de obra × 1", "Limpieza × 4"... Solo el Administrador las usa.
    Sin descripción, toma el nombre del tipo de servicio.
    """

    service_type_detail = ServiceTypeSummarySerializer(
        source="service_type",
        read_only=True,
    )
    amount = serializers.SerializerMethodField()

    class Meta:
        model = ServiceChargeLine
        fields = (
            "id",
            "service_record",
            "service_type",
            "service_type_detail",
            "description",
            "quantity",
            "unit_price",
            "amount",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True},
        }

    def get_amount(self, obj):
        return str(obj.amount)

    def validate_description(self, value):
        return value.strip()

    def validate(self, attrs):
        if self.instance is not None:
            if (
                "service_record" in attrs
                and attrs["service_record"] != self.instance.service_record
            ):
                raise serializers.ValidationError(
                    {"service_record": "Una línea no se cambia de servicio."}
                )

            service_record = self.instance.service_record
        else:
            service_record = attrs.get("service_record")

        if service_record.status in _LOCKED_SERVICE_STATUSES:
            raise serializers.ValidationError(
                "No se puede modificar el cobro de servicios entregados o anulados."
            )

        service_type = attrs.get(
            "service_type",
            self.instance.service_type if self.instance is not None else None,
        )

        if (
            "service_type" in attrs
            and service_type is not None
            and not service_type.is_active
        ):
            raise serializers.ValidationError(
                {"service_type": "El tipo de servicio está inactivo."}
            )

        description = attrs.get(
            "description",
            self.instance.description if self.instance is not None else "",
        )

        if not description:
            if service_type is None:
                raise serializers.ValidationError(
                    {
                        "description": (
                            "Falta qué se cobra, o un tipo de servicio."
                        )
                    }
                )

            attrs["description"] = service_type.name

        return attrs