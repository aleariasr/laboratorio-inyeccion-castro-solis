import type { ReactNode } from "react";

import { formatMoney } from "@/features/inventory/purchases/format";

type PettyCashSummaryProps = {
  opening: number;
  outflows: number;
  // En el formulario, la primera vez, el fondo se escribe: aquí va el
  // campo en vez del monto.
  openingInput?: ReactNode;
  openingNote?: string;
};

/**
 * Caja chica en el cierre (puntos 21 + 22): fondo − salidas = saldo. Lo
 * cobrado + saldo, que es contra lo que se compara lo contado, va aparte
 * y destacado en PhysicalTotalHero. Lo usan el formulario de cierre y su
 * detalle.
 */
export function PettyCashSummary({
  opening,
  outflows,
  openingInput,
  openingNote,
}: PettyCashSummaryProps) {
  const balance = opening - outflows;

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
    </div>
  );
}
