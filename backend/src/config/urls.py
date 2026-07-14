from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", include("apps.health.urls")),
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/inventory/", include("apps.inventory.urls")),
    path("api/sales/", include("apps.sales.urls")),
    path("api/customers/", include("apps.customers.urls")),
    path("api/", include("apps.core.urls")),
    path("api/", include("apps.configuration.urls")),
    path("api/documents/", include("apps.documents.urls")),
]