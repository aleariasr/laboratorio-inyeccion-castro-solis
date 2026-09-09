import type { ApiFieldErrors } from "@/lib/api/types";

import type { CashClosingFormErrors, CashClosingFormField } from "./types";

const FIELD_MAP: Record<string, CashClosingFormField> = {
  week_start: "weekStart",
  counted_cash_total: "countedCashTotal",
  difference_reason: "differenceReason",
  notes: "notes",
};

export function mapCashClosingApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): CashClosingFormErrors {
  const mappedErrors: CashClosingFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
