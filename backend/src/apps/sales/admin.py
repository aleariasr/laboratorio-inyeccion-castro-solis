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