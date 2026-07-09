from rest_framework.routers import DefaultRouter

from apps.inventory.views import (
    ProductViewSet,
    StorageLocationViewSet,
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
    "suppliers",
    SupplierViewSet,
    basename="supplier",
)

urlpatterns = router.urls