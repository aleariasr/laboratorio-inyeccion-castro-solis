import { formatMoney } from "@/features/inventory/purchases/format";

type PhysicalTotalHeroProps = {
  // "Debe haber al contar" en el formulario; "Debía haber" en un cierre
  // ya hecho.
  label: string;
  collected: number;
  pettyCashBalance: number;
};

function signedMoney(value: number): string {
  return `${value < 0 ? "−" : ""}₡${formatMoney(Math.abs(value))}`;
}

/**
 * El número contra el que se compara lo contado (punto 5 del plan del
 * 2026-10-22): lo cobrado más el saldo de caja chica, grande y centrado,
 * con de dónde sale. Lo usan el formulario de cierre (justo antes de
 * "Total contado") y el detalle del cierre.
 */
export function PhysicalTotalHero({
  label,
  collected,
  pettyCashBalance,
}: PhysicalTotalHeroProps) {
  const physicalTotal = collected + pettyCashBalance;

  return (
    <div className="rounded-[var(--radius-xl)] bg-[var(--color-primary-soft)] px-6 py-7 text-center ring-1 ring-[rgb(7_81_132_/_14%)]">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
        {label}
      </p>

      <p className="mt-2 font-mono text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-5xl">
        {signedMoney(physicalTotal)}
      </p>

      <p className="mt-3 text-sm text-muted-foreground">
        Total cobrado{" "}
        <span className="font-mono font-semibold text-foreground">
          ₡{formatMoney(collected)}
        </span>{" "}
        más el saldo de caja chica{" "}
        <span className="font-mono font-semibold text-foreground">
          {signedMoney(pettyCashBalance)}
        </span>
      </p>
    </div>
  );
}
