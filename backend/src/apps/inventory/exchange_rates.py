"""
Reglas del tipo de cambio (auditoría de compras en dólares, 2026-11-07).

Todo exchange_rate del sistema es colones por dólar (₡ por US$1):

- Un documento (compra o costo de importación) en colones guarda 1: no
  hay nada que convertir.
- Uno en dólares guarda el tipo de cambio con que se pagó, y tiene que
  ser un valor real de ₡ por US$1. Antes se aceptaba cualquier número
  mayor que cero, y una compra en dólares con tipo de cambio 1 dejaba
  un repuesto de US$10 con precio de venta ₡10.

El frontend repite el mismo rango (features/inventory/purchases/
exchange-rate.ts); si se cambia aquí, se cambia allá.
"""

from decimal import Decimal

from apps.inventory.models import Currency

CRC_EXCHANGE_RATE = Decimal("1")

USD_EXCHANGE_RATE_MIN = Decimal("100")
USD_EXCHANGE_RATE_MAX = Decimal("2000")

USD_EXCHANGE_RATE_REQUIRED_MESSAGE = (
    "El tipo de cambio es obligatorio en dólares."
)
USD_EXCHANGE_RATE_RANGE_MESSAGE = (
    "El tipo de cambio debe estar en colones por dólar, "
    f"entre {USD_EXCHANGE_RATE_MIN} y {USD_EXCHANGE_RATE_MAX}."
)


def is_valid_usd_exchange_rate(value) -> bool:
    return (
        value is not None
        and USD_EXCHANGE_RATE_MIN <= Decimal(value) <= USD_EXCHANGE_RATE_MAX
    )


def to_crc(amount, currency, exchange_rate) -> Decimal:
    """Un monto en su moneda, en colones (una sola conversión)."""

    if currency == Currency.USD:
        return amount * exchange_rate

    return amount
