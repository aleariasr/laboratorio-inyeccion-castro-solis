from django.urls import path

from .views import (
    LowStockProductsReportView,
    ProductMovementsReportView,
    StockByLocationReportView,
    UniversalSearchView,
)

app_name = "core"

urlpatterns = [
    path("search/", UniversalSearchView.as_view(), name="search"),
    path(
        "reports/low-stock-products/",
        LowStockProductsReportView.as_view(),
        name="report-low-stock-products",
    ),
    path(
        "reports/stock-by-location/",
        StockByLocationReportView.as_view(),
        name="report-stock-by-location",
    ),
    path(
        "reports/product-movements/",
        ProductMovementsReportView.as_view(),
        name="report-product-movements",
    ),
]