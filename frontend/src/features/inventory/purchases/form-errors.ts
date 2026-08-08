import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  PurchaseFormErrors,
  PurchaseFormField,
} from "./types";

const FIELD_MAP: Record<string, PurchaseFormField> = {
  supplier: "supplierId",
  invoice_number: "invoiceNumber",
  purchase_date: "purchaseDate",
  currency: "currency",
  exchange_rate: "exchangeRate",
  notes: "notes",
  is_active: "isActive",
};

export function mapPurchaseApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): PurchaseFormErrors {
  const mappedErrors: PurchaseFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
