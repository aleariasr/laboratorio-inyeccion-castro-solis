from django.conf import settings
from django.http import JsonResponse


def health_check(request):
    return JsonResponse(
        {
            "status": "healthy",
            "service": "Laboratorio de Inyección Castro Solís",
            "version": settings.APP_VERSION,
        }
    )
