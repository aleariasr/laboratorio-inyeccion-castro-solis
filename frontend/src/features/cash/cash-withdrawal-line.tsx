import { formatColones } from "@/features/inventory/purchases/format";

type CashWithdrawalLineProps = {
  // Contado − fondo para la semana siguiente.
  amount: number;
};

/**
 * Cuánto sale de la caja al cerrar (2026-11-07): lo contado menos el
 * fondo que se deja para la semana siguiente. Si es negativo, lo contado
 * no alcanza para dejar ese fondo y hay que reponer la diferencia (pasa
 * con un sobregiro grande). Lo usan el formulario de cierre y su detalle.
 */
export function CashWithdrawalLine({ amount }: CashWithdrawalLineProps) {
  if (amount < 0) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Hay que reponer{" "}
        <span className="font-mono font-semibold">{formatColones(Math.abs(amount))}</span>{" "}
        para dejar el fondo de la semana siguiente: lo contado no alcanza.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Se retira de la caja:{" "}
      <span className="font-mono font-semibold text-foreground">{formatColones(amount)}</span>{" "}
      (lo contado menos el fondo para la semana siguiente; incluye vouchers y comprobantes).
    </p>
  );
}
