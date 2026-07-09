from rest_framework.routers import DefaultRouter

from apps.customers.views import (
    CustomerViewSet,
    InjectorAccessoryViewSet,
    InjectorServiceRecordViewSet,
    InjectorViewSet,
)

from apps.customers.views import (
    CustomerViewSet,
    InjectorAccessoryViewSet,
    InjectorServiceAccessoryViewSet,
    InjectorServiceRecordViewSet,
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
router.register(
    "service-records",
    InjectorServiceRecordViewSet,
    basename="service-record",
)
router.register(
    "accessories",
    InjectorAccessoryViewSet,
    basename="accessory",
)

router.register(
    "service-accessories",
    InjectorServiceAccessoryViewSet,
    basename="service-accessory",
)

urlpatterns = router.urls