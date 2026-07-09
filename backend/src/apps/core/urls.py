from django.urls import path

from .views import UniversalSearchView

app_name = "core"

urlpatterns = [
    path("search/", UniversalSearchView.as_view(), name="search"),
]