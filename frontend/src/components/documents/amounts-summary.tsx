import { formatMoney } from "@/features/inventory/purchases/format";
import {
  formatPercentage,
  type DiscountType,
  type DocumentAmounts,
} from "@/lib/document-amounts";

type AmountsSummaryProps = {
  // null: no se puede calcular (descuento inválido o sin precio).
  amounts: DocumentAmounts | null;
  // Lo que se muestra como subtotal si amounts es null.
  fallbackSubtotal: number | null;
  discountType: DiscountType;
  discountValue: string;
  taxPercentage: string;
  // En edición se ven todas las filas; en un documento cerrado, las que
  // valen cero se omiten (igual que en la factura).
  showZeroRows: boolean;
  subtotalLabel?: string;
};

/**
 * Subtotal / Descuento / Impuesto / Total de un documento. Lo usan la
 * venta y el servicio para que se vean igual.
 */
export function AmountsSummary({
  amounts,
  fallbackSubtotal,
  discountType,
  discountValue,
  taxPercentage,
  showZeroRows,
  subtotalLabel = "Subtotal",
}: AmountsSummaryProps) {
  const discountLabel =
    discountType === "PERCENT" && Number(discountValue) > 0
      ? `Descuento (${formatPercentage(discountValue)} %)`
      : "Descuento";

  const subtotal = amounts?.subtotal ?? fallbackSubtotal;

  return (
    <dl className="grid gap-2.5 rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] p-5 text-sm ring-1 ring-[rgb(7_81_132_/_12%)]">
      <div className="flex justify-between gap-4 text-muted-foreground">
        <dt>{subtotalLabel}</dt>
        <dd className="font-mono">
          {subtotal !== null ? `₡${formatMoney(subtotal)}` : "—"}
        </dd>
      </div>

      {(showZeroRows || (amounts && amounts.discountAmount > 0)) && (
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt>{discountLabel}</dt>
          <dd className="font-mono">
            {amounts ? `− ₡${formatMoney(amounts.discountAmount)}` : "—"}
          </dd>
        </div>
      )}

      {(showZeroRows || (amounts && amounts.taxAmount > 0)) && (
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt>Impuesto ({formatPercentage(taxPercentage || "0")} %)</dt>
          <dd className="font-mono">
            {amounts ? `₡${formatMoney(amounts.taxAmount)}` : "—"}
          </dd>
        </div>
      )}

      <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-[rgb(7_81_132_/_14%)] pt-3">
        <dt className="font-semibold text-foreground">Total</dt>
        <dd className="font-mono text-2xl font-semibold text-foreground">
          {amounts ? `₡${formatMoney(amounts.total)}` : "—"}
        </dd>
      </div>
    </dl>
  );
}
