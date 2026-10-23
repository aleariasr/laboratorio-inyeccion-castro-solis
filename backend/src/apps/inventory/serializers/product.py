from rest_framework import serializers

from apps.core.permissions import ROLE_ADMIN
from apps.inventory.models import (
    Product,
    StorageLocation,
)
from apps.inventory.models.product import LOCATION_CODE_VALIDATOR
from apps.inventory.selectors import (
    current_stock,
    effective_sale_price,
    latest_suggested_price,
)

SALE_PRICE_REQUIRES_COSTS_MESSAGE = (
    "Solo quien puede ver costos puede definir el precio de venta."
)


def user_can_read_costs(request):
    """
    Lo mismo que CostsPermission, para usar dentro de un serializer:
    superusuario, rol ADMIN o view_costs suelto.

    Sin request no se puede decidir y se responde False, que es el lado
    seguro: el síntoma de olvidar el contexto es un dato oculto o un
    precio rechazado, nunca una fuga.
    """

    if request is None or not request.user or not request.user.is_authenticated:
        return False

    return (
        request.user.is_superuser
        or request.user.groups.filter(name=ROLE_ADMIN).exists()
        or request.user.has_perm("core.view_costs")
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


def normalize_own_code(value, *, instance=None):
    """
    Código propio (punto 16): en mayúsculas como el universal y, si tiene
    valor, sin repetirse entre productos (la base lo garantiza con
    inventory_product_unique_own_code; esto da el mensaje claro).
    """

    normalized_code = value.strip().upper()

    if not normalized_code:
        return ""

    queryset = Product.objects.filter(own_code=normalized_code)

    if instance is not None:
        queryset = queryset.exclude(pk=instance.pk)

    if queryset.exists():
        raise serializers.ValidationError(
            "Ya existe un producto con este código propio."
        )

    return normalized_code


def validate_active_location(value):
    if not value.is_active:
        raise serializers.ValidationError(
            "No puede asignar el producto a una ubicación inactiva."
        )

    return value


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
            "own_code",
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

    def validate_own_code(self, value):
        return normalize_own_code(value, instance=self.instance)

    def validate_storage_location(self, value):
        return validate_active_location(value)

    def validate_custom_sale_price(self, value):
        # Fijar el precio sin ver el costo permite vender por debajo de
        # él sin saberlo. Mandar el mismo valor que ya tiene (el
        # formulario reenvía todos los campos) no cuenta como cambio.
        current = (
            self.instance.custom_sale_price
            if self.instance is not None
            else None
        )

        if value != current and not self._can_read_costs():
            raise serializers.ValidationError(
                SALE_PRICE_REQUIRES_COSTS_MESSAGE
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

        # Antes se rechazaba cualquier cambio de ubicación en un
        # producto con variantes, asumiendo que toda la familia comparte
        # estante. Los datos reales del cliente lo desmienten: 152
        # familias de equivalentes están repartidas en estantes
        # distintos. Además la regla producía un bloqueo mutuo — para
        # mudar una familia unificada había que mover al primero, y
        # mover al primero siempre fallaba, así que una familia no se
        # podía reubicar nunca. Compartir ubicación queda como valor por
        # defecto de `add-variant`, no como restricción.

        return attrs

    def get_current_stock(self, obj):
        if hasattr(obj, "current_stock"):
            return obj.current_stock

        return current_stock(obj)

    def get_latest_suggested_price(self, obj):
        """
        Precio sugerido: sale del costo de la última compra confirmada,
        así que solo lo ve quien tiene view_costs (hoy, el Administrador).
        Para los demás es null.

        effective_sale_price no se oculta: es el precio al que se vende,
        que necesita cualquiera que arme una venta o una proforma, aunque
        salga del sugerido cuando el producto no tiene precio propio.
        """

        if not self._can_read_costs():
            return None

        if hasattr(obj, "latest_suggested_price"):
            value = obj.latest_suggested_price
        else:
            value = latest_suggested_price(obj)

        return str(value) if value is not None else None

    def _can_read_costs(self):
        # En un listado, DRF reutiliza la misma instancia hija para cada
        # producto: se calcula una vez y se guarda, si no la consulta del
        # grupo ADMIN se repetiría por fila (N+1).
        if not hasattr(self, "_can_read_costs_cache"):
            self._can_read_costs_cache = self._resolve_can_read_costs()

        return self._can_read_costs_cache

    def _resolve_can_read_costs(self):
        return user_can_read_costs(self.context.get("request"))

    def get_effective_sale_price(self, obj):
        value = effective_sale_price(obj)

        return str(value) if value is not None else None


class ProductVariantCreateSerializer(serializers.ModelSerializer):
    """
    Crea una nueva variante (original/genérico/otro) de un producto
    existente. standard_code NO es campo de este serializer: siempre se
    hereda del producto padre en la vista (ProductViewSet.add_variant),
    porque la familia se agrupa por él (ver variant_family).

    Desde el punto 16 la variante puede traer su código propio y su
    propia ubicación; sin ubicación, usa la del padre.
    """

    storage_location = serializers.PrimaryKeyRelatedField(
        queryset=StorageLocation.objects.all(),
        required=False,
    )

    # Declarado explícito (sin usar el default="unidad" del modelo):
    # si no se manda, la vista lo completa con el unit_of_measure del
    # producto padre, no con el default genérico del modelo.
    unit_of_measure = serializers.CharField(required=False)

    class Meta:
        model = Product
        fields = (
            "id",
            "own_code",
            "name",
            "description",
            "storage_location",
            "variant_kind",
            "unit_of_measure",
            "minimum_stock",
            "custom_sale_price",
        )

    def validate_own_code(self, value):
        return normalize_own_code(value)

    def validate_storage_location(self, value):
        return validate_active_location(value)

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

    def validate_custom_sale_price(self, value):
        # Misma regla que ProductSerializer: una variante nueva no trae
        # precio propio salvo que lo defina quien ve costos. Necesita el
        # request en el contexto (ver ProductViewSet.add_variant).
        if value is not None and not user_can_read_costs(
            self.context.get("request"),
        ):
            raise serializers.ValidationError(
                SALE_PRICE_REQUIRES_COSTS_MESSAGE
            )

        return value
