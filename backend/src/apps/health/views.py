from django.http import JsonResponse


def health_check(request):
    return JsonResponse(
        {
            "status": "healthy",
            "service": "Laboratorio de Inyección Castro Solís",
            "version": "0.1.0-alpha",
        }
    )