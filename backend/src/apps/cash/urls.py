from rest_framework.routers import DefaultRouter

from apps.cash.views import CashClosingViewSet

router = DefaultRouter()
router.register(
    "closings",
    CashClosingViewSet,
    basename="cash-closing",
)

urlpatterns = router.urls
