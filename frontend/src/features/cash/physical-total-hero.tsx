import { formatMoney } from "@/features/inventory/purchases/format";

type PhysicalTotalHeroProps = {
  // "Debe haber al contar" en el formulario; "Debía haber" en un cierre
  // ya hecho.
  label: string;
  collected: number;
  pettyCashOpening: number;
  pettyCashOutflows: number;
};

function signedMoney(value: number): string {
  return `${value < 0 ? "−" : ""}₡${formatMoney(Math.abs(value))}`;
}

/**
 * El número contra el que se compara lo contado (punto 5 del plan del
 * 2026-10-22): lo cobrado + el fondo de caja chica − los gastos, grande y
 * centrado, con de dónde sale. Si los gastos superaron el fondo, la
 * diferencia salió de los ingresos (sobregiro) y ya está descontada. Lo
 * usan el formulario de cierre y el detalle del cierre.
 */
export function PhysicalTotalHero({
  label,
  collected,
  pettyCashOpening,
  pettyCashOutflows,
}: PhysicalTotalHeroProps) {
  const physicalTotal = collected + pettyCashOpening - pettyCashOutflows;
  const overdraft = Math.max(pettyCashOutflows - pettyCashOpening, 0);

  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] px-6 py-7 text-center ring-1 ring-[rgb(7_81_132_/_14%)]">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
        {label}
      </p>

      <p className="mt-2 font-mono text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-5xl">
        {signedMoney(physicalTotal)}
      </p>

      <p className="mt-3 text-sm text-muted-foreground">
        Cobrado{" "}
        <span className="font-mono font-semibold text-foreground">
          ₡{formatMoney(collected)}
        </span>{" "}
        + fondo de caja chica{" "}
        <span className="font-mono font-semibold text-foreground">
          ₡{formatMoney(pettyCashOpening)}
        </span>{" "}
        − gastos{" "}
        <span className="font-mono font-semibold text-foreground">
          ₡{formatMoney(pettyCashOutflows)}
        </span>
      </p>

      {overdraft > 0 && (
        <p className="mt-1 text-sm text-[var(--color-warning)]">
          De los gastos,{" "}
          <span className="font-mono font-semibold">₡{formatMoney(overdraft)}</span> se
          pagaron con los ingresos (sobregiro).
        </p>
      )}
    </div>
  );
}
