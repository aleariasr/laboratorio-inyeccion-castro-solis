import datetime


def json_safe(value):
    """
    Convierte un valor (o dict/list de valores) leído de un DBF a algo
    serializable en un JSONField: las fechas quedan como texto ISO
    (YYYY-MM-DD), todo lo demás pasa tal cual.
    """
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_safe(v) for v in value]
    return value
