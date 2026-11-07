from decimal import Decimal

from rest_framework import serializers

from .models import CashClosing, PettyCashMovement


def business_income(expected_total, expected_tax):
    """
    Lo que es del negocio: lo cobrado menos los impuestos, que se le
    deben a Hacienda (punto 18). Se deriva, no se guarda.
    """

    return expected_total - expected_tax


def petty_cash_balance(opening, outflows):
    """Saldo de caja chica: fondo inicial − salidas (puntos 21 + 22)."""

    return opening - outflows


def petty_cash_fund_balance(opening, outflows):
    """
    Lo que queda del fondo de caja chica: nunca menos de cero. Los gastos
    se pagan primero del fondo; lo que lo supera es sobregiro.
    """

    return max(opening - outflows, Decimal("0"))


def petty_cash_overdraft(opening, outflows):
    """
    Sobregiro: la parte de los gastos que superó el fondo y se pagó con
    el efectivo de los ingresos de la semana. Se deriva, no se guarda; ya
    está descontado de lo que debe haber al contar.
    """

    return max(outflows - opening, Decimal("0"))


def cash_withdrawal(counted_total, next_opening):
    """
    Lo que sale de la caja al cerrar: lo contado menos el fondo que se
    deja para la semana siguiente (incluye vouchers y comprobantes).
    Negativo si lo contado no alcanza para dejar ese fondo.
    """

    return counted_total - next_opening


def expected_physical_total(expected_total, opening, outflows):
    """
    Lo que debe haber al contar: lo cobrado (ventas y servicios, todos
    los métodos) más el saldo de caja chica, que también está en la caja.
    """

    return expected_total + petty_cash_balance(opening, outflows)


class CashClosingSerializer(serializers.ModelSerializer):
    expected_business_income = serializers.SerializerMethodField()
    petty_cash_balance = serializers.SerializerMethodField()
    petty_cash_fund_balance = serializers.SerializerMethodField()
    petty_cash_overdraft = serializers.SerializerMethodField()
    expected_physical_total = serializers.SerializerMethodField()
    cash_withdrawal = serializers.SerializerMethodField()

    class Meta:
        model = CashClosing
        fields = (
            "id",
            "week_start",
            "week_end",
            "expected_total",
            "expected_cash",
            "expected_card",
            "expected_transfer",
            "expected_other",
            "expected_tax",
            "expected_discount",
            "expected_business_income",
            "petty_cash_opening",
            "petty_cash_outflows",
            "petty_cash_balance",
            "petty_cash_fund_balance",
            "petty_cash_overdraft",
            "next_petty_cash_opening",
            "expected_physical_total",
            "counted_total",
            "cash_withdrawal",
            "difference",
            "difference_reason",
            "notes",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_expected_business_income(self, obj):
        return business_income(obj.expected_total, obj.expected_tax)

    def get_petty_cash_balance(self, obj):
        return petty_cash_balance(obj.petty_cash_opening, obj.petty_cash_outflows)

    def get_petty_cash_fund_balance(self, obj):
        return petty_cash_fund_balance(
            obj.petty_cash_opening,
            obj.petty_cash_outflows,
        )

    def get_petty_cash_overdraft(self, obj):
        return petty_cash_overdraft(obj.petty_cash_opening, obj.petty_cash_outflows)

    def get_cash_withdrawal(self, obj):
        return cash_withdrawal(obj.counted_total, obj.next_petty_cash_opening)

    def get_expected_physical_total(self, obj):
        return expected_physical_total(
            obj.expected_total,
            obj.petty_cash_opening,
            obj.petty_cash_outflows,
        )


class CashClosingCreateSerializer(serializers.Serializer):
    week_start = serializers.DateField()
    counted_total = serializers.DecimalField(
        max_digits=14,
        decimal_places=4,
        min_value=Decimal("0"),
    )
    difference_reason = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )
    # Solo se usa la primera vez (sin cierre anterior): después el fondo
    # se hereda del cierre anterior y este valor se ignora.
    petty_cash_opening = serializers.DecimalField(
        max_digits=14,
        decimal_places=4,
        min_value=Decimal("0"),
        required=False,
        allow_null=True,
        default=None,
    )
    # Sin indicar, la semana siguiente arranca con el mismo fondo.
    next_petty_cash_opening = serializers.DecimalField(
        max_digits=14,
        decimal_places=4,
        min_value=Decimal("0"),
        required=False,
        allow_null=True,
        default=None,
    )


class PettyCashMovementSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PettyCashMovement
        fields = (
            "id",
            "date",
            "amount",
            "reason",
            "created_by",
            "created_by_name",
            "created_at",
        )
        read_only_fields = ("created_by", "created_by_name", "created_at")

    def validate_reason(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("El motivo del gasto es obligatorio.")

        return value

    def get_created_by_name(self, obj):
        user = obj.created_by

        if user is None:
            return None

        return user.get_full_name() or user.username
