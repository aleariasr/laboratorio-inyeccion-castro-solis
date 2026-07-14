from django.urls import path

from .views import ProductLabelsPdfView

app_name = "documents"

urlpatterns = [
    path(
        "product-labels/",
        ProductLabelsPdfView.as_view(),
        name="product-labels",
    ),
]