from rest_framework.routers import DefaultRouter

from apps.inventory.views import (
    InventoryCountItemViewSet,
    InventoryCountViewSet,
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
router.register(
    "inventory-counts",
    InventoryCountViewSet,
    basename="inventory-count",
)
router.register(
    "inventory-count-items",
    InventoryCountItemViewSet,
    basename="inventory-count-item",
)

urlpatterns = router.urls