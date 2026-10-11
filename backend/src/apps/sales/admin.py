from django.contrib import admin

from .models import Sale, SaleItem


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "customer",
        "sale_date",
        "currency",
        "status",
        "total_amount",
        "is_active",
    )
    search_fields = (
        "id",
        "customer__display_name",
        "customer__identification",
    )
    list_filter = (
        "status",
        "currency",
        "sale_date",
        "is_active",
    )
    # Congelados al confirmar: son lo que se cobró y lo que suma la caja.
    # Editarlos a mano descuadraría el cierre (punto 19).
    readonly_fields = (
        "subtotal_amount",
        "discount_amount",
        "tax_amount",
        "total_amount",
    )


@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
    list_display = (
        "sale",
        "product",
        "quantity",
        "unit_price",
    )
    search_fields = (
        "sale__id",
        "product__standard_code",
        "product__name",
    )