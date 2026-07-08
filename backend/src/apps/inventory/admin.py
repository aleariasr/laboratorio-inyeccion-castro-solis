from django.contrib import admin

from .models import (
    Product,
    ProductReference,
    StorageLocation,
    Supplier,
    SupplierProduct,
)


@admin.register(StorageLocation)
class StorageLocationAdmin(admin.ModelAdmin):
    list_display = ("code", "description", "is_active")
    search_fields = ("code", "description")
    list_filter = ("is_active",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "standard_code",
        "name",
        "storage_location",
        "minimum_stock",
        "unit_of_measure",
        "is_active",
    )
    search_fields = ("standard_code", "name", "description")
    list_filter = ("is_active", "unit_of_measure")


@admin.register(ProductReference)
class ProductReferenceAdmin(admin.ModelAdmin):
    list_display = ("reference_code", "manufacturer", "product", "is_active")
    search_fields = (
        "reference_code",
        "manufacturer",
        "description",
        "product__standard_code",
        "product__name",
    )
    list_filter = ("is_active", "manufacturer")

@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "contact_name",
        "phone",
        "country",
        "is_active",
    )

    search_fields = (
        "name",
        "contact_name",
        "phone",
        "email",
    )

    list_filter = (
        "country",
        "is_active",
    )

@admin.register(SupplierProduct)
class SupplierProductAdmin(admin.ModelAdmin):
    list_display = (
        "supplier",
        "product",
        "supplier_reference",
        "manufacturer",
        "preferred_supplier",
        "is_active",
    )

    search_fields = (
        "supplier__name",
        "product__standard_code",
        "product__name",
        "supplier_reference",
        "manufacturer",
    )

    list_filter = (
        "preferred_supplier",
        "manufacturer",
        "is_active",
    )
