export type CashClosing = {
  id: number;
  week_start: string;
  week_end: string;
  expected_total: string;
  expected_cash: string;
  expected_card: string;
  expected_transfer: string;
  expected_other: string;
  counted_total: string;
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
  expected_total: string;
  expected_cash: string;
  expected_card: string;
  expected_transfer: string;
  expected_other: string;
};

export type CashClosingFilters = {
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
