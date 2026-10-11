/**
 * Espejo de backend/src/apps/core/money.py, solo para la vista previa
 * mientras se escribe: el monto que vale es el que calcula el backend.
 *
 *   subtotal − descuento (monto o % del subtotal) = base
 *   base + impuesto (% de la base) = total
 *
 * Se trabaja en céntimos enteros y se redondea a 2 decimales "hacia
 * arriba en el medio" (ROUND_HALF_UP), como el backend.
 */

export type DiscountType = "AMOUNT" | "PERCENT";

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  AMOUNT: "Monto",
  PERCENT: "Porcentaje",
};

export type DocumentAmounts = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
};

export type DocumentAmountsResult =
  | { ok: true; amounts: DocumentAmounts }
  | {
      ok: false;
      field: "discountValue" | "taxPercentage";
      message: string;
    };

function roundCents(value: number): number {
  // toFixed(6) quita el ruido binario (333.49999999 → 333.5) antes de
  // redondear al céntimo.
  return Math.round(Number(value.toFixed(6)));
}

export function computeDocumentAmounts(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number,
  taxPercentage: number,
): DocumentAmountsResult {
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    return {
      ok: false,
      field: "discountValue",
      message: "El descuento no puede ser negativo.",
    };
  }

  if (!Number.isFinite(taxPercentage) || taxPercentage < 0 || taxPercentage > 100) {
    return {
      ok: false,
      field: "taxPercentage",
      message: "El impuesto debe estar entre 0 y 100 %.",
    };
  }

  if (discountType === "PERCENT" && discountValue > 100) {
    return {
      ok: false,
      field: "discountValue",
      message: "El descuento en porcentaje no puede superar el 100 %.",
    };
  }

  const subtotalCents = roundCents(subtotal * 100);

  const discountCents =
    discountType === "PERCENT"
      ? roundCents((subtotalCents * discountValue) / 100)
      : roundCents(discountValue * 100);

  if (discountCents > subtotalCents) {
    return {
      ok: false,
      field: "discountValue",
      message: "El descuento no puede ser mayor que el subtotal.",
    };
  }

  const taxableCents = subtotalCents - discountCents;
  const taxCents = roundCents((taxableCents * taxPercentage) / 100);

  return {
    ok: true,
    amounts: {
      subtotal: subtotalCents / 100,
      discountAmount: discountCents / 100,
      taxAmount: taxCents / 100,
      total: (taxableCents + taxCents) / 100,
    },
  };
}

/** 13.00 → "13", 12.50 → "12.5" */
export function formatPercentage(value: string | number): string {
  return String(Number(value));
}
