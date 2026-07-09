from rest_framework.routers import DefaultRouter

from apps.inventory.views import (
    ProductViewSet,
    StorageLocationViewSet,
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

urlpatterns = router.urls