from rest_framework.routers import DefaultRouter

from apps.inventory.views import (
    ProductReferenceViewSet,
    ProductViewSet,
    PurchaseItemViewSet,
    PurchaseViewSet,
    StorageLocationViewSet,
    SupplierProductViewSet,
    SupplierViewSet,
)

router = DefaultRouter()
router.register(
    "locations",
    StorageLocationViewSet,
    basename="storage-location",
)
router.register(
    "products",
    ProductViewSet,
    basename="product",
)
router.register(
    "product-references",
    ProductReferenceViewSet,
    basename="product-reference",
)
router.register(
    "suppliers",
    SupplierViewSet,
    basename="supplier",
)
router.register(
    "supplier-products",
    SupplierProductViewSet,
    basename="supplier-product",
)
router.register(
    "purchases",
    PurchaseViewSet,
    basename="purchase",
)
router.register(
    "purchase-items",
    PurchaseItemViewSet,
    basename="purchase-item",
)

urlpatterns = router.urls