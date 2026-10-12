import type { ReactNode } from "react";

import { formatMoney } from "@/features/inventory/purchases/format";

type PettyCashSummaryProps = {
  opening: number;
  outflows: number;
  expectedTotal: number;
  // En el formulario, la primera vez, el fondo se escribe: aquí va el
  // campo en vez del monto.
  openingInput?: ReactNode;
  openingNote?: string;
};

/**
 * Caja chica en el cierre (puntos 21 + 22): fondo − salidas = saldo, y
 * lo cobrado + saldo = efectivo físico esperado, que es contra lo que se
 * compara lo contado. Lo usan el formulario de cierre y su detalle.
 */
export function PettyCashSummary({
  opening,
  outflows,
  expectedTotal,
  openingInput,
  openingNote,
}: PettyCashSummaryProps) {
  const balance = opening - outflows;
  const physicalTotal = expectedTotal + balance;

  return (
    <div className="grid gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Caja chica
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Fondo al inicio
          </p>

          {openingInput ?? (
            <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
              ₡{formatMoney(opening)}
            </p>
          )}

          {openingNote && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {openingNote}
            </p>
          )}
        </div>

        <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Salidas de la semana
          </p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
            − ₡{formatMoney(outflows)}
          </p>
        </div>

        <div
          className={[
            "rounded-[var(--radius-lg)] p-4",
            balance < 0
              ? "bg-[var(--color-danger-soft)]"
              : "bg-surface-muted",
          ].join(" ")}
        >
          <p
            className={[
              "text-sm font-medium",
              balance < 0
                ? "text-[var(--color-danger)]"
                : "text-muted-foreground",
            ].join(" ")}
          >
            Saldo de caja chica
          </p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
            {balance < 0 ? "−" : ""}₡{formatMoney(Math.abs(balance))}
          </p>
          {balance < 0 && (
            <p className="mt-1 text-xs leading-5 text-[var(--color-danger)]">
              Las salidas superan el fondo.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] px-5 py-4 ring-1 ring-[rgb(7_81_132_/_12%)]">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Debe haber al contar
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Lo cobrado (₡{formatMoney(expectedTotal)}) más el saldo de caja chica.
          </p>
        </div>

        <p className="font-mono text-2xl font-semibold text-foreground">
          ₡{formatMoney(physicalTotal)}
        </p>
      </div>
    </div>
  );
}
