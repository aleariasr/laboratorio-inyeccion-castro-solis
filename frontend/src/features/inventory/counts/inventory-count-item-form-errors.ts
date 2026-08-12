import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  InventoryCountItemFormErrors,
  InventoryCountItemFormField,
} from "./types";

const FIELD_MAP: Record<string, InventoryCountItemFormField> = {
  product: "productId",
  counted_quantity: "countedQuantity",
};

export function mapInventoryCountItemApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): InventoryCountItemFormErrors {
  const mappedErrors: InventoryCountItemFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
