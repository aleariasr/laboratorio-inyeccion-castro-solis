from django.conf import settings
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView


class SystemStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user

        return Response(
            {
                "status": "healthy",
                "service": "Laboratorio de Inyección Castro Solís",
                "version": settings.APP_VERSION,
                "server_time": timezone.now(),
                "environment": {
                    "debug": settings.DEBUG,
                    "settings_module": settings.SETTINGS_MODULE,
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
                "modules": [
                    "accounts",
                    "inventory",
                    "customers",
                    "sales",
                    "reports",
                    "search",
                    "configuration",
                ],
            }
        )