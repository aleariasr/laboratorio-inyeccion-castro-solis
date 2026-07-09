from django.urls import path

from .views import SystemStatusView

app_name = "configuration"

urlpatterns = [
    path("system/status/", SystemStatusView.as_view(), name="system-status"),
]