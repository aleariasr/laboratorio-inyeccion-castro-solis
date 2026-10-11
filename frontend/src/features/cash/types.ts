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
};

export type CashClosingFormValues = {
  weekStart: string;
  countedTotal: string;
  differenceReason: string;
  notes: string;
};

export type CashClosingFormField =
  | "weekStart"
  | "countedTotal"
  | "differenceReason"
  | "notes";

export type CashClosingFormErrors = Partial<Record<CashClosingFormField, string>>;

export const EMPTY_CASH_CLOSING_FORM_VALUES: CashClosingFormValues = {
  weekStart: "",
  countedTotal: "",
  differenceReason: "",
  notes: "",
};

export function buildCashClosingWritePayload(
  values: CashClosingFormValues,
): CashClosingWritePayload {
  return {
    week_start: values.weekStart,
    counted_total: values.countedTotal.trim(),
    difference_reason: values.differenceReason.trim(),
    notes: values.notes.trim(),
  };
}
