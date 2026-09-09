export type CashClosing = {
  id: number;
  week_start: string;
  week_end: string;
  expected_cash_total: string;
  counted_cash_total: string;
  difference: string;
  difference_reason: string;
  notes: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

export type CashClosingPreview = {
  week_start: string;
  week_end: string;
  expected_cash_total: string;
};

export type CashClosingFilters = {
  page: number;
  pageSize: number;
};

export type CashClosingWritePayload = {
  week_start: string;
  counted_cash_total: string;
  difference_reason: string;
  notes: string;
};

export type CashClosingFormValues = {
  weekStart: string;
  countedCashTotal: string;
  differenceReason: string;
  notes: string;
};

export type CashClosingFormField =
  | "weekStart"
  | "countedCashTotal"
  | "differenceReason"
  | "notes";

export type CashClosingFormErrors = Partial<Record<CashClosingFormField, string>>;

export const EMPTY_CASH_CLOSING_FORM_VALUES: CashClosingFormValues = {
  weekStart: "",
  countedCashTotal: "",
  differenceReason: "",
  notes: "",
};

export function buildCashClosingWritePayload(
  values: CashClosingFormValues,
): CashClosingWritePayload {
  return {
    week_start: values.weekStart,
    counted_cash_total: values.countedCashTotal.trim(),
    difference_reason: values.differenceReason.trim(),
    notes: values.notes.trim(),
  };
}
