from django.utils.dateparse import parse_date

from rest_framework.exceptions import ValidationError


def parse_boolean_query_param(value, *, name):
    """
    Convierte un parámetro de consulta opcional a booleano.

    Únicamente acepta los valores textuales true y false.
    """

    if value is None or value == "":
        return None

    normalized_value = value.strip().lower()

    if normalized_value == "true":
        return True

    if normalized_value == "false":
        return False

    raise ValidationError(
        {
            name: [
                "Debe indicar true o false.",
            ]
        }
    )


def parse_positive_integer_query_param(value, *, name):
    """
    Convierte un parámetro de consulta opcional a entero positivo.
    """

    if value is None or value == "":
        return None

    try:
        parsed_value = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(
            {
                name: [
                    "Debe indicar un número entero positivo.",
                ]
            }
        ) from exc

    if parsed_value <= 0:
        raise ValidationError(
            {
                name: [
                    "Debe indicar un número entero positivo.",
                ]
            }
        )

    return parsed_value

def parse_date_query_param(value, *, name):
    """
    Convierte un parámetro de consulta opcional a fecha (YYYY-MM-DD).
    """

    if value is None or value == "":
        return None

    parsed_value = parse_date(value.strip())

    if parsed_value is None:
        raise ValidationError(
            {
                name: [
                    "Debe tener formato YYYY-MM-DD.",
                ]
            }
        )

    return parsed_value
