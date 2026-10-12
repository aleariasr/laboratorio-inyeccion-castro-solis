from rest_framework.routers import DefaultRouter

from apps.cash.views import CashClosingViewSet, PettyCashMovementViewSet

router = DefaultRouter()
router.register(
    "closings",
    CashClosingViewSet,
    basename="cash-closing",
)

router.register(
    "petty-cash",
    PettyCashMovementViewSet,
    basename="petty-cash",
)

urlpatterns = router.urls
