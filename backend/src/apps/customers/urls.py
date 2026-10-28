from rest_framework.routers import DefaultRouter

from apps.customers.views import (
    CustomerViewSet,
    InjectorServiceRecordViewSet,
    InjectorViewSet,
)

from apps.customers.views import (
    CustomerViewSet,
    InjectorServiceAccessoryViewSet,
    InjectorServiceRecordViewSet,
    InjectorViewSet,
    ServiceChargeLineViewSet,
    ServiceTypeViewSet,
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
    "service-accessories",
    InjectorServiceAccessoryViewSet,
    basename="service-accessory",
)

router.register(
    "service-types",
    ServiceTypeViewSet,
    basename="service-type",
)

router.register(
    "service-charge-lines",
    ServiceChargeLineViewSet,
    basename="service-charge-line",
)

urlpatterns = router.urls