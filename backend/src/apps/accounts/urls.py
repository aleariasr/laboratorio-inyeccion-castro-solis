from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CurrentUserView,
    LoginView,
    LogoutView,
    UserViewSet,
)

app_name = "accounts"

router = DefaultRouter()
router.register(
    "users",
    UserViewSet,
    basename="user",
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="me"),
]

urlpatterns += router.urls