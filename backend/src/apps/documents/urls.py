from django.urls import path

from .views import (
    ProductLabelsPdfView,
    ProformaPdfView,
    SaleInvoicePdfView,
    ServiceInvoicePdfView,
)

app_name = "documents"

urlpatterns = [
    path(
        "product-labels/",
        ProductLabelsPdfView.as_view(),
        name="product-labels",
    ),
    path(
        "proforma/",
        ProformaPdfView.as_view(),
        name="proforma",
    ),
    path(
        "sales/<int:sale_id>/invoice/",
        SaleInvoicePdfView.as_view(),
        name="sale-invoice",
    ),
    path(
        "services/<int:service_record_id>/invoice/",
        ServiceInvoicePdfView.as_view(),
        name="service-invoice",
    ),
]
