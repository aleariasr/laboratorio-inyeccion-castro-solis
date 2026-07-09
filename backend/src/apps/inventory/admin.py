from django.contrib import admin

from .models import (
    ImportCost,
    ImportCostCategory,
    InventoryCount,
    InventoryCountItem,
    Product,
    ProductCostHistory,
    ProductReference,
    Purchase,
    PurchaseItem,
    StockMovement,
    StorageLocation,
    Supplier,
    SupplierProduct,
)


@admin.register(StorageLocation)
class StorageLocationAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "description",
        "is_active",
    )
    search_fields = (
        "code",
        "description",
    )
    list_filter = (
        "is_active",
    )


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
    search_fields = (
        "standard_code",
        "name",
        "description",
    )
    list_filter = (
        "is_active",
        "unit_of_measure",
    )


@admin.register(ProductReference)
class ProductReferenceAdmin(admin.ModelAdmin):
    list_display = (
        "reference_code",
        "manufacturer",
        "product",
        "is_active",
    )
    search_fields = (
        "reference_code",
        "manufacturer",
        "description",
        "product__standard_code",
        "product__name",
    )
    list_filter = (
        "is_active",
        "manufacturer",
    )


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


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "supplier",
        "purchase_date",
        "currency",
        "status",
        "is_active",
    )
    search_fields = (
        "invoice_number",
        "supplier__name",
    )
    list_filter = (
        "status",
        "currency",
        "purchase_date",
        "is_active",
    )


@admin.register(PurchaseItem)
class PurchaseItemAdmin(admin.ModelAdmin):
    list_display = (
        "purchase",
        "supplier_product",
        "quantity",
        "unit_cost",
    )
    search_fields = (
        "purchase__invoice_number",
        "supplier_product__product__standard_code",
        "supplier_product__supplier__name",
    )


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "movement_type",
        "direction",
        "quantity",
        "purchase_item",
        "sale_item",
        "created_at",
    )
    search_fields = (
        "product__standard_code",
        "product__name",
        "purchase_item__purchase__invoice_number",
        "sale_item__sale__id",
    )
    list_filter = (
        "movement_type",
        "direction",
        "created_at",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )


@admin.register(InventoryCount)
class InventoryCountAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "count_date",
        "status",
        "is_active",
    )
    search_fields = (
        "reference",
    )
    list_filter = (
        "status",
        "count_date",
        "is_active",
    )


@admin.register(InventoryCountItem)
class InventoryCountItemAdmin(admin.ModelAdmin):
    list_display = (
        "inventory_count",
        "product",
        "counted_quantity",
    )
    search_fields = (
        "inventory_count__reference",
        "product__standard_code",
        "product__name",
    )


@admin.register(ImportCostCategory)
class ImportCostCategoryAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "is_active",
    )
    search_fields = (
        "name",
    )
    list_filter = (
        "is_active",
    )


@admin.register(ImportCost)
class ImportCostAdmin(admin.ModelAdmin):
    list_display = (
        "purchase",
        "category",
        "amount",
        "currency",
        "is_active",
    )
    search_fields = (
        "purchase__invoice_number",
        "category__name",
        "description",
    )
    list_filter = (
        "currency",
        "category",
        "is_active",
    )


@admin.register(ProductCostHistory)
class ProductCostHistoryAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "purchase",
        "original_unit_cost",
        "final_unit_cost",
        "margin_percentage",
        "suggested_price",
        "currency",
        "calculated_at",
    )
    search_fields = (
        "product__standard_code",
        "product__name",
        "purchase__invoice_number",
    )
    list_filter = (
        "currency",
        "calculated_at",
    )
    readonly_fields = (
        "calculated_at",
        "created_at",
        "updated_at",
    )