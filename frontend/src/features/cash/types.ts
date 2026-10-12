export type CashClosing = {
  id: number;
  week_start: string;
  week_end: string;
  expected_total: string;
  expected_cash: string;
  expected_card: string;
  expected_transfer: string;
  expected_other: string;
  // Punto 18: dentro de expected_total, pero no son del negocio.
  expected_tax: string;
  // Informativo: ya restados de expected_total.
  expected_discount: string;
  // expected_total − expected_tax (lo calcula el backend).
  expected_business_income: string;
  // Caja chica (puntos 21 + 22). Saldo y efectivo físico los calcula el
  // backend: saldo = fondo − salidas; físico = expected_total + saldo.
  petty_cash_opening: string;
  petty_cash_outflows: string;
  petty_cash_balance: string;
  next_petty_cash_opening: string;
  expected_physical_total: string;
  counted_total: string;
  difference: string;
  difference_reason: string;
  notes: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

/** Una semana ya terminada que todavía no tiene cierre. */
export type CloseableWeek = {
  week_start: string;
  week_end: string;
};

export type CloseableWeeks = {
  /** De la más reciente a la más antigua. Vacío si no hay pendientes. */
  weeks: CloseableWeek[];
  /** Viernes de la semana en curso: cuándo se podrá cerrar la siguiente. */
  next_week_end: string;
};

export type CashClosingPreview = {
  week_start: string;
  week_end: string;
  can_close: boolean;
  expected_total: string;
  expected_cash: string;
  expected_card: string;
  expected_transfer: string;
  expected_other: string;
  expected_tax: string;
  expected_discount: string;
  expected_business_income: string;
  // null la primera vez (sin cierre anterior): el fondo se escribe al
  // cerrar, y saldo y físico vienen calculados con fondo 0.
  petty_cash_opening: string | null;
  petty_cash_outflows: string;
  petty_cash_balance: string;
  expected_physical_total: string;
};

export type PettyCashMovement = {
  id: number;
  date: string;
  amount: string;
  reason: string;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
};

export type PettyCashMovementWritePayload = {
  date: string;
  amount: string;
  reason: string;
};

export type CashClosingFilters = {
  /** Busca en las notas y en el motivo de la diferencia. */
  query: string;
  /** "YYYY-MM-DD"; trae las semanas que se superponen con el rango. */
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
};

export type CashClosingWritePayload = {
  week_start: string;
  counted_total: string;
  difference_reason: string;
  notes: string;
  petty_cash_opening?: string;
  next_petty_cash_opening?: string;
};

export type CashClosingFormValues = {
  weekStart: string;
  countedTotal: string;
  differenceReason: string;
  notes: string;
  // Solo la primera vez (sin cierre anterior); si no, se hereda.
  pettyCashOpening: string;
  // Vacío = la semana siguiente arranca con el mismo fondo.
  nextPettyCashOpening: string;
};

export type CashClosingFormField =
  | "weekStart"
  | "countedTotal"
  | "differenceReason"
  | "notes"
  | "pettyCashOpening"
  | "nextPettyCashOpening";

export type CashClosingFormErrors = Partial<Record<CashClosingFormField, string>>;

export const EMPTY_CASH_CLOSING_FORM_VALUES: CashClosingFormValues = {
  weekStart: "",
  countedTotal: "",
  differenceReason: "",
  notes: "",
  pettyCashOpening: "",
  nextPettyCashOpening: "",
};

export function buildCashClosingWritePayload(
  values: CashClosingFormValues,
): CashClosingWritePayload {
  return {
    week_start: values.weekStart,
    counted_total: values.countedTotal.trim(),
    difference_reason: values.differenceReason.trim(),
    notes: values.notes.trim(),
    ...(values.pettyCashOpening.trim()
      ? { petty_cash_opening: values.pettyCashOpening.trim() }
      : {}),
    ...(values.nextPettyCashOpening.trim()
      ? { next_petty_cash_opening: values.nextPettyCashOpening.trim() }
      : {}),
  };
}
