from django.conf import settings
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import AdministrationPermission

from .constants import SYSTEM_MODULES


class SystemStatusView(APIView):
    permission_classes = [AdministrationPermission]

    def get(self, request):
        user = request.user

        environment_name = (
            "development"
            if settings.DEBUG
            else "production"
        )

        return Response(
            {
                "status": "healthy",
                "service": (
                    "Laboratorio de Inyección Castro Solís"
                ),
                "version": settings.APP_VERSION,
                "server_time": timezone.now(),
                "environment": {
                    "name": environment_name,
                    "debug": settings.DEBUG,
                },
                "user": {
                    "id": user.id,
                    "username": user.get_username(),
                    "is_staff": user.is_staff,
                    "is_superuser": user.is_superuser,
                    "groups": list(
                        user.groups.values_list(
                            "name",
                            flat=True,
                        )
                    ),
                },
                "modules": list(SYSTEM_MODULES),
            }
        )
