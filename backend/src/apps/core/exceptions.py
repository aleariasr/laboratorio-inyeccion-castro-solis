"""
Mensajes de error de la API en tono neutro (auditoría integral del
2026-11-07, H-17).

Los mensajes que traen Django y DRF por defecto llegan en imperativo
("Asegúrese de que este valor es mayor o igual a 0.") y algunos en inglés
("No Sale matches the given query.", "JSON parse error - …"). Los mensajes
propios del sistema ya siguen la regla ("X es obligatorio.", "X debe
ser…"); este manejador reescribe solo los genéricos, reconocidos por su
texto exacto, y deja todo lo demás igual. Conserva el código de cada error
(ErrorDetail.code) y el estado HTTP.
"""

import re

from rest_framework.exceptions import ErrorDetail
from rest_framework.views import exception_handler as drf_exception_handler

REQUIRED_MESSAGE = "Este campo es obligatorio."

# (patrón del mensaje por defecto, mensaje neutro). El patrón tiene que
# calzar con el texto completo.
NEUTRAL_MESSAGES = [
    (r"Este campo es requerido\.", REQUIRED_MESSAGE),
    (r"Este campo no puede estar en blanco\.", REQUIRED_MESSAGE),
    (r"Este campo no puede ser nulo\.", REQUIRED_MESSAGE),
    (
        r"Asegúrese de que este valor es mayor o igual a (?P<limit>.+)\.",
        "El valor debe ser mayor o igual a {limit}.",
    ),
    (
        r"Asegúrese de que este valor es menor o igual a (?P<limit>.+)\.",
        "El valor debe ser menor o igual a {limit}.",
    ),
    (
        r"Asegúrese de que este campo no tenga más de (?P<limit>\d+) caracteres\.",
        "El texto admite como máximo {limit} caracteres.",
    ),
    (
        r"Asegúrese de que este campo tenga al menos (?P<limit>\d+) caracteres\.",
        "El texto debe tener al menos {limit} caracteres.",
    ),
    (
        r"Asegúrese de que no haya más de (?P<limit>\d+) dígitos en total\.",
        "El número admite como máximo {limit} dígitos.",
    ),
    (
        r"Asegúrese de que no haya más de (?P<limit>\d+) decimales\.",
        "El número admite como máximo {limit} decimales.",
    ),
    (
        r"Asegúrese de que no haya más de (?P<limit>\d+) dígitos antes del "
        r"punto decimal\.",
        "El número admite como máximo {limit} dígitos enteros.",
    ),
    (r"Se requiere un número válido\.", "El valor debe ser un número."),
    (r"Introduzca un número entero válido\.", "El valor debe ser un número entero."),
    (r"Fecha con formato erróneo\..*", "La fecha no es válida."),
    (r"Fecha/hora con formato erróneo\..*", "La fecha y hora no son válidas."),
    (r'".*" no es una elección válida\.', "La opción elegida no es válida."),
    (r'Clave primaria ".*" inválida - objeto no existe\.', "El registro elegido no existe."),
    (r"Tipo incorrecto\..*", "El valor no tiene el tipo esperado."),
    (r"Debe ser un booleano válido\.", "El valor debe ser verdadero o falso."),
    (
        r"Introduzca una dirección de correo electrónico válida\.",
        "El correo electrónico no es válido.",
    ),
    (r"Se esperaba una lista de elementos.*", "Se esperaba una lista."),
    (r"No .+ matches the given query\.", "El registro no existe."),
    (r"JSON parse error.*", "Los datos enviados no son válidos."),
    (
        r"Usted no tiene permiso para realizar esta acción\.",
        "El usuario no tiene permiso para esta acción.",
    ),
]

_COMPILED = [(re.compile(pattern, re.DOTALL), message) for pattern, message in NEUTRAL_MESSAGES]


def neutral_message(text):
    """El mensaje neutro equivalente, o el mismo texto si no es uno genérico."""

    for pattern, message in _COMPILED:
        match = pattern.fullmatch(text)

        if match:
            return message.format(**match.groupdict())

    return text


def _neutralize(value):
    if isinstance(value, dict):
        return {key: _neutralize(item) for key, item in value.items()}

    if isinstance(value, list):
        return [_neutralize(item) for item in value]

    if isinstance(value, str):
        rewritten = neutral_message(str(value))

        if rewritten == value:
            return value

        return ErrorDetail(rewritten, code=getattr(value, "code", None))

    return value


def neutral_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)

    if response is not None and response.data is not None:
        response.data = _neutralize(response.data)

    return response
