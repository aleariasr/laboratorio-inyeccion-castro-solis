from django.contrib import admin

from .models import CashClosing


@admin.register(CashClosing)
class CashClosingAdmin(admin.ModelAdmin):
    list_display = (
        "week_start",
        "week_end",
        "expected_total",
        "counted_total",
        "difference",
        "created_by",
    )
    search_fields = (
        "week_start",
        "week_end",
    )
    list_filter = (
        "week_start",
    )
