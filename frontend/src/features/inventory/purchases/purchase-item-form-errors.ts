import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  PurchaseItemFormErrors,
  PurchaseItemFormField,
} from "./types";

const FIELD_MAP: Record<string, PurchaseItemFormField> = {
  supplier_product: "supplierProductId",
  quantity: "quantity",
  unit_cost: "unitCost",
};

export function mapPurchaseItemApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): PurchaseItemFormErrors {
  const mappedErrors: PurchaseItemFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
