/**
 * Traslados a otra sede (punto 6 del plan del 2026-10-22). Espejo de
 * apps/inventory/serializers/transfer.py.
 */

export type StockTransferStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";

export type Branch = {
  id: number;
  name: string;
  is_active: boolean;
};

export type StockTransferProductDetail = {
  id: number;
  standard_code: string;
  own_code: string;
  name: string;
  location_code: string;
  unit_of_measure: string;
};

export type StockTransferItem = {
  id: number;
  product: number;
  product_detail: StockTransferProductDetail;
  quantity: number;
};

export type StockTransfer = {
  id: number;
  branch: number;
  branch_detail: Branch;
  transfer_date: string;
  status: StockTransferStatus;
  notes: string;
  items: StockTransferItem[];
  total_quantity: number;
  confirmed_at: string | null;
  confirmed_by_username: string | null;
  cancelled_at: string | null;
  cancelled_by_username: string | null;
  cancellation_reason: string;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
};

export type StockTransferFilters = {
  query: string;
  status: "" | StockTransferStatus;
  page: number;
  pageSize: number;
};

export type StockTransferFormValues = {
  branchId: string;
  transferDate: string;
  notes: string;
};

export type StockTransferFormErrors = Partial<Record<keyof StockTransferFormValues, string>>;

export type StockTransferWritePayload = {
  branch: number;
  transfer_date: string;
  notes: string;
};

export const STOCK_TRANSFER_STATUS_LABELS: Record<StockTransferStatus, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmado",
  CANCELLED: "Anulado",
};

export const STOCK_TRANSFER_STATUS_BADGE_CLASSES: Record<StockTransferStatus, string> = {
  DRAFT: "bg-surface-muted text-muted-foreground",
  CONFIRMED: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  CANCELLED: "bg-[var(--color-danger-soft)] text-danger",
};

/** Fecha de hoy en la hora local (no en UTC), como AAAA-MM-DD. */
export function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Una fecha sin hora (AAAA-MM-DD) en texto. Se arma con la fecha local:
 * `new Date("2026-10-25")` es medianoche UTC, que en Costa Rica cae el
 * día anterior.
 */
export function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(
    new Date(year, month - 1, day),
  );
}

export function emptyStockTransferFormValues(): StockTransferFormValues {
  return { branchId: "", transferDate: todayIsoDate(), notes: "" };
}

export function stockTransferFormValues(transfer: StockTransfer): StockTransferFormValues {
  return {
    branchId: String(transfer.branch),
    transferDate: transfer.transfer_date,
    notes: transfer.notes,
  };
}

export function validateStockTransferForm(
  values: StockTransferFormValues,
): StockTransferFormErrors {
  const errors: StockTransferFormErrors = {};

  if (!values.branchId) {
    errors.branchId = "Elija la sede de destino.";
  }

  if (!values.transferDate) {
    errors.transferDate = "Indique la fecha del traslado.";
  }

  return errors;
}

export function buildStockTransferWritePayload(
  values: StockTransferFormValues,
): StockTransferWritePayload {
  return {
    branch: Number(values.branchId),
    transfer_date: values.transferDate,
    notes: values.notes.trim(),
  };
}

export function mapStockTransferApiFieldErrors(
  fieldErrors: Record<string, string[]>,
): StockTransferFormErrors {
  return {
    branchId: fieldErrors.branch?.[0],
    transferDate: fieldErrors.transfer_date?.[0],
    notes: fieldErrors.notes?.[0],
  };
}
