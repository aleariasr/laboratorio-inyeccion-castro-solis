import type { ApiFieldErrors } from "@/lib/api/types";

import type { SaleItemFormErrors, SaleItemFormField } from "./types";

const FIELD_MAP: Record<string, SaleItemFormField> = {
  product: "productId",
  quantity: "quantity",
  unit_price: "unitPrice",
};

export function mapSaleItemApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): SaleItemFormErrors {
  const mappedErrors: SaleItemFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
