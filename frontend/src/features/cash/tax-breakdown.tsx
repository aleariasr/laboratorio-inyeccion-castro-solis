import { formatMoney } from "@/features/inventory/purchases/format";

type TaxBreakdownProps = {
  tax: string;
  businessIncome: string;
  discount: string;
};

/**
 * "De ese dinero" (punto 18): el total esperado incluye los impuestos
 * cobrados porque entraron como dinero, pero no son del negocio: se le
 * deben a Hacienda. Este bloque los separa del ingreso real. Lo usan el
 * formulario de cierre (vista previa) y el detalle de un cierre hecho.
 */
export function TaxBreakdown({ tax, businessIncome, discount }: TaxBreakdownProps) {
  return (
    <div className="grid gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        De ese dinero
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-lg)] bg-[var(--color-warning-soft)] p-4">
          <p className="text-sm font-medium text-[var(--color-warning)]">
            Impuestos cobrados
          </p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
            ₡{formatMoney(tax)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Corresponden a Hacienda; no forman parte del ingreso.
          </p>
        </div>

        <div className="rounded-[var(--radius-lg)] bg-[var(--color-success-soft)] p-4">
          <p className="text-sm font-medium text-[var(--color-success)]">
            Ingreso del negocio
          </p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
            ₡{formatMoney(businessIncome)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Lo cobrado sin los impuestos.
          </p>
        </div>

        <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Descuentos dados
          </p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
            ₡{formatMoney(discount)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Informativo: ya están restados del total.
          </p>
        </div>
      </div>
    </div>
  );
}
