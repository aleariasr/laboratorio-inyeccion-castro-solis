from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """
    Paginación estándar para los listados de la API de LICS.

    El tamaño predeterminado busca equilibrar rendimiento y densidad
    operativa en equipos de recursos limitados.
    """

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 100
