from django.urls import path

from .views import (
    CurrentUserView,
    LoginView,
    LogoutView,
    UserListCreateView,
)

app_name = "accounts"

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="me"),
    path("users/", UserListCreateView.as_view(), name="users"),
]
