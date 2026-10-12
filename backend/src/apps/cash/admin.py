from django.contrib import admin

from .models import CashClosing, PettyCashMovement


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

    # Un cierre es un registro histórico fijo (ver CashClosing): la API
    # no lo edita y el admin tampoco.
    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PettyCashMovement)
class PettyCashMovementAdmin(admin.ModelAdmin):
    list_display = (
        "date",
        "reason",
        "amount",
        "created_by",
    )
    search_fields = (
        "reason",
    )
    list_filter = (
        "date",
    )

    # Solo consulta: registrar, editar o borrar desde aquí saltaría la
    # regla de no tocar semanas ya cerradas (ver services.py).
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
