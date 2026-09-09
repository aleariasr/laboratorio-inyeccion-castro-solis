from django.contrib import admin

from .models import (
    Customer,
    Injector,
    InjectorServiceAccessory,
    InjectorServiceRecord,
    ServiceType,
    ServiceTypePriceHistory,
)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        "display_name",
        "customer_type",
        "identification",
        "phone",
        "email",
        "is_active",
    )
    search_fields = (
        "display_name",
        "identification",
        "phone",
        "email",
    )
    list_filter = (
        "customer_type",
        "is_active",
    )


@admin.register(Injector)
class InjectorAdmin(admin.ModelAdmin):
    list_display = (
        "injector_number",
        "customer",
        "description",
        "is_active",
    )
    search_fields = (
        "injector_number",
        "customer__display_name",
        "customer__identification",
        "description",
    )
    list_filter = (
        "is_active",
    )


@admin.register(InjectorServiceRecord)
class InjectorServiceRecordAdmin(admin.ModelAdmin):
    list_display = (
        "injector",
        "received_at",
        "delivered_at",
        "status",
        "is_active",
    )
    search_fields = (
        "injector__injector_number",
        "injector__customer__display_name",
        "injector__customer__identification",
    )
    list_filter = (
        "status",
        "received_at",
        "delivered_at",
        "is_active",
    )


@admin.register(InjectorServiceAccessory)
class InjectorServiceAccessoryAdmin(admin.ModelAdmin):
    list_display = (
        "service_record",
        "product",
        "quantity",
        "notes",
    )
    search_fields = (
        "service_record__injector__injector_number",
        "product__standard_code",
        "product__name",
        "notes",
    )


@admin.register(ServiceType)
class ServiceTypeAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "description",
        "is_active",
    )
    search_fields = (
        "name",
        "description",
    )
    list_filter = (
        "is_active",
    )


@admin.register(ServiceTypePriceHistory)
class ServiceTypePriceHistoryAdmin(admin.ModelAdmin):
    list_display = (
        "service_type",
        "service_record",
        "price",
        "charged_at",
    )
    search_fields = (
        "service_type__name",
        "service_record__injector__injector_number",
    )
    list_filter = (
        "charged_at",
    )