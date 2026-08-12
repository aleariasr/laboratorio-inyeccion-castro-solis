import type { ApiFieldErrors } from "@/lib/api/types";

import type { SaleFormErrors, SaleFormField } from "./types";

const FIELD_MAP: Record<string, SaleFormField> = {
  customer: "customerId",
  sale_date: "saleDate",
  notes: "notes",
  is_active: "isActive",
};

export function mapSaleApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): SaleFormErrors {
  const mappedErrors: SaleFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
