import type { ReactNode } from "react";

import { formatColones } from "@/features/inventory/purchases/format";

type PettyCashSummaryProps = {
  opening: number;
  outflows: number;
  // En el formulario, la primera vez, el fondo se escribe: aquí va el
  // campo en vez del monto.
  openingInput?: ReactNode;
  openingNote?: string;
};

/**
 * Caja chica en el cierre (puntos 21 + 22): fondo − gastos = saldo del
 * fondo, que nunca baja de cero. Si los gastos lo superan, la diferencia
 * se pagó con los ingresos de la semana (sobregiro) y se muestra aparte.
 * Lo cobrado + fondo − gastos, que es contra lo que se compara lo
 * contado, va destacado en PhysicalTotalHero. Lo usan el formulario de
 * cierre y su detalle.
 */
export function PettyCashSummary({
  opening,
  outflows,
  openingInput,
  openingNote,
}: PettyCashSummaryProps) {
  const fundBalance = Math.max(opening - outflows, 0);
  const overdraft = Math.max(outflows - opening, 0);

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
              {formatColones(opening)}
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
            Gastos de la semana
          </p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
            − {formatColones(outflows)}
          </p>
        </div>

        <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Saldo del fondo
          </p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
            {formatColones(fundBalance)}
          </p>
        </div>
      </div>

      {overdraft > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-lg)] bg-[var(--color-warning-soft)] px-4 py-3">
          <p className="text-sm text-[var(--color-warning)]">
            <span className="font-semibold">Pagado con ingresos (sobregiro).</span> Los gastos
            superaron el fondo; la diferencia salió del efectivo cobrado esa semana.
          </p>
          <p className="font-mono text-base font-semibold text-[var(--color-warning)]">
            {formatColones(overdraft)}
          </p>
        </div>
      )}
    </div>
  );
}
