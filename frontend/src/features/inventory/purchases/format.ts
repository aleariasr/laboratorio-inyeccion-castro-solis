/**
 * Formatea números para mostrar en pantalla: máximo `maxDecimals` decimales
 * (sin ceros de relleno) y separador de miles con espacio.
 * Ej.: formatNumber(15000) -> "15 000", formatNumber(110.5) -> "110.5"
 */
function trimDecimals(value: number, maxDecimals: number): string {
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  const fixed = rounded.toFixed(maxDecimals);

  return maxDecimals > 0 ? fixed.replace(/\.?0+$/, "") : fixed;
}

export function formatNumber(value: string | number, maxDecimals = 2): string {
  const numericValue = typeof value === "string" ? Number(value) : value;

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  const isNegative = numericValue < 0;

  const [integerPart, decimalPart] = trimDecimals(
    Math.abs(numericValue),
    maxDecimals,
  ).split(".");

  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  const formatted = decimalPart ? `${groupedInteger}.${decimalPart}` : groupedInteger;

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Un monto de dinero: sin decimales si es entero ("15 000") y con los dos
 * decimales completos si tiene céntimos ("4 647.50", no "4 647.5").
 */
export function formatMoney(value: string | number): string {
  const formatted = formatNumber(value, 2);
  const [, decimalPart] = formatted.split(".");

  return decimalPart?.length === 1 ? `${formatted}0` : formatted;
}

/**
 * Un monto en colones: "₡15 000.50". Negativo con el signo antes del
 * símbolo y el menos tipográfico: "−₡2 500" (antes salía "₡-2 500",
 * auditoría integral del 2026-11-07).
 */
export function formatColones(value: string | number): string {
  const formatted = formatMoney(value);

  return formatted.startsWith("-")
    ? `−₡${formatted.slice(1)}`
    : `₡${formatted}`;
}

/**
 * Equivalente en colones de un monto en dólares, usando un tipo de cambio
 * en colones por dólar (₡ por US$1). Retorna null si no aplica.
 */
export function crcEquivalent(
  amountUsd: string | number,
  exchangeRate: string | number,
): string | null {
  const numericAmount = typeof amountUsd === "string" ? Number(amountUsd) : amountUsd;
  const numericRate = typeof exchangeRate === "string" ? Number(exchangeRate) : exchangeRate;

  if (
    !Number.isFinite(numericAmount) ||
    !Number.isFinite(numericRate) ||
    numericRate <= 0
  ) {
    return null;
  }

  return `≈ ${formatColones(numericAmount * numericRate)}`;
}

/**
 * Formatea una fecha/hora ISO para mostrar en pantalla (zona horaria de
 * Costa Rica). Si el valor no es una fecha válida, lo devuelve tal cual.
 */
export function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(date);
}

/**
 * Una fecha sin hora (AAAA-MM-DD) en texto: "25 oct 2026". Se arma con la
 * fecha local: `new Date("2026-10-25")` es medianoche UTC, que en Costa
 * Rica cae el día anterior.
 */
export function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(
    new Date(year, month - 1, day),
  );
}
