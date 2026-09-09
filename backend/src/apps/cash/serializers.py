from decimal import Decimal

from rest_framework import serializers

from .models import CashClosing


class CashClosingSerializer(serializers.ModelSerializer):
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
            "counted_total",
            "difference",
            "difference_reason",
            "notes",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


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
