import {
  canReadInventoryCounts,
  canReadPurchases,
  canReadSales,
  canReadServices,
  canReadTransfers,
} from "@/features/auth/permissions";
import type { AuthUser } from "@/features/auth/types";

import type { StockMovement } from "./types";

export type MovementOrigin = {
  label: string;
  /** null cuando no hay documento o el usuario no puede abrirlo. */
  href: string | null;
};

/**
 * De dónde viene un movimiento de inventario y a dónde se puede ir.
 *
 * La usan la pantalla de Movimientos y el historial del detalle de producto,
 * para que las dos muestren lo mismo. El enlace se omite si el usuario no
 * tiene permiso para abrir el destino: el texto sigue visible (es parte de la
 * explicación del movimiento), pero no se ofrece una página que el backend le
 * va a negar.
 */
export function getMovementOrigin(
  movement: StockMovement,
  user: AuthUser | null,
): MovementOrigin {
  if (movement.purchase_id !== null) {
    const label = movement.purchase_invoice_number
      ? `Compra ${movement.purchase_invoice_number}`
      : `Compra #${movement.purchase_id}`;

    return {
      label,
      href:
        user && canReadPurchases(user)
          ? `/inventory/purchases/${movement.purchase_id}`
          : null,
    };
  }

  if (movement.sale_id !== null) {
    return {
      label: `Venta #${movement.sale_id}`,
      href: user && canReadSales(user) ? `/sales/${movement.sale_id}` : null,
    };
  }

  if (movement.inventory_count !== null) {
    const label = movement.inventory_count_reference
      ? `Conteo ${movement.inventory_count_reference}`
      : `Conteo #${movement.inventory_count}`;

    return {
      label,
      href:
        user && canReadInventoryCounts(user)
          ? `/inventory/counts/${movement.inventory_count}`
          : null,
    };
  }

  if (movement.service_record_id !== null) {
    return {
      label: `Servicio #${movement.service_record_id}`,
      href:
        user && canReadServices(user)
          ? `/services/${movement.service_record_id}`
          : null,
    };
  }

  if (movement.stock_transfer_id !== null) {
    return {
      label: `Traslado #${movement.stock_transfer_id}`,
      href:
        user && canReadTransfers(user)
          ? `/inventory/transfers/${movement.stock_transfer_id}`
          : null,
    };
  }

  if (movement.reverses_movement !== null) {
    return {
      label: `Revierte #${movement.reverses_movement}`,
      href: null,
    };
  }

  if (movement.movement_type === "INITIAL") {
    return { label: "Inventario inicial", href: null };
  }

  return { label: "Sin documento asociado", href: null };
}
