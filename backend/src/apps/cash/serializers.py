from decimal import Decimal

from rest_framework import serializers

from .models import CashClosing


def business_income(expected_total, expected_tax):
    """
    Lo que es del negocio: lo cobrado menos los impuestos, que se le
    deben a Hacienda (punto 18). Se deriva, no se guarda.
    """

    return expected_total - expected_tax


class CashClosingSerializer(serializers.ModelSerializer):
    expected_business_income = serializers.SerializerMethodField()

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
            "counted_total",
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
