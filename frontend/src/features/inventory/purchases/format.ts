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

export function formatMoney(value: string | number): string {
  return formatNumber(value, 2);
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

  return `≈ ${formatMoney(numericAmount * numericRate)} CRC`;
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
