from rest_framework.routers import DefaultRouter

from apps.customers.views import (
    CustomerViewSet,
    InjectorViewSet,
)

router = DefaultRouter()
router.register(
    "customers",
    CustomerViewSet,
    basename="customer",
)
router.register(
    "injectors",
    InjectorViewSet,
    basename="injector",
)

urlpatterns = router.urls