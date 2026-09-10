"""
Extracción del código de ubicación embebido al final del nombre de la
pieza en el sistema legacy (ej. "CAMISA VALVULA TRASIEGO PERKINS 354
B147" -> nombre "CAMISA VALVULA TRASIEGO PERKINS 354", ubicación
"B147"). Confirmado con Alejandro contra el catálogo real.

El código puede terminar en una letra extra de subdivisión (ej. A339B,
A287D, A239A — letra de estante + posición + subdivisión), no solo en
dígitos (B147, D116).

Regla de confianza acordada:
- token de 3+ caracteres (ej. B147, D116, A339B): se acepta siempre.
- token de 2 caracteres (ej. E1, H3): solo se acepta si el mismo token
  aparece en 2 o más piezas distintas del catálogo completo (evita
  confundir, por ejemplo, un número de modelo de motor con una
  ubicación real).
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

_SUFFIX_RE = re.compile(r"[.\s]+([A-Za-z]{1,3}[0-9]{1,4}[A-Za-z]?)\s*$")


@dataclass
class LocationResolution:
    clean_name: str
    location_code: str | None
    low_confidence_token: str | None


def resolve_locations(names_by_key: dict[str, str]) -> dict[str, LocationResolution]:
    candidates: dict[str, tuple[str, str]] = {}
    token_counts: Counter = Counter()

    for key, name in names_by_key.items():
        match = _SUFFIX_RE.search(name)
        if not match:
            continue
        token = match.group(1).upper()
        clean_name = name[: match.start()].rstrip(" .")
        candidates[key] = (clean_name, token)
        token_counts[token] += 1

    results: dict[str, LocationResolution] = {}
    for key, name in names_by_key.items():
        if key not in candidates:
            results[key] = LocationResolution(
                clean_name=name, location_code=None, low_confidence_token=None
            )
            continue

        clean_name, token = candidates[key]
        if len(token) >= 3 or token_counts[token] >= 2:
            results[key] = LocationResolution(
                clean_name=clean_name, location_code=token, low_confidence_token=None
            )
        else:
            results[key] = LocationResolution(
                clean_name=name, location_code=None, low_confidence_token=token
            )
    return results
