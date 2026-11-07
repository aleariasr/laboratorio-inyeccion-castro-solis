import type { Currency } from "./types";

/**
 * Tipo de cambio en colones por dólar (₡ por US$1). Mismo rango que el
 * backend (apps/inventory/exchange_rates.py): si se cambia allá, se cambia
 * aquí. Un documento en colones guarda 1.
 */
export const USD_EXCHANGE_RATE_MIN = 100;
export const USD_EXCHANGE_RATE_MAX = 2000;

/**
 * Error del tipo de cambio de un documento en `currency`, o null si es
 * válido. En colones no aplica (siempre se guarda 1).
 */
export function validateExchangeRate(
  currency: Currency,
  rawValue: string,
): string | null {
  if (currency !== "USD") {
    return null;
  }

  const value = rawValue.trim();

  if (!value) {
    return "El tipo de cambio es obligatorio en dólares.";
  }

  const numericValue = Number(value);

  if (
    Number.isNaN(numericValue) ||
    numericValue < USD_EXCHANGE_RATE_MIN ||
    numericValue > USD_EXCHANGE_RATE_MAX
  ) {
    return `El tipo de cambio debe estar en colones por dólar, entre ${USD_EXCHANGE_RATE_MIN} y ${USD_EXCHANGE_RATE_MAX}.`;
  }

  return null;
}
