import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  InventoryCountFormErrors,
  InventoryCountFormField,
} from "./types";

const FIELD_MAP: Record<string, InventoryCountFormField> = {
  reference: "reference",
  count_date: "countDate",
  notes: "notes",
  is_active: "isActive",
};

export function mapInventoryCountApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): InventoryCountFormErrors {
  const mappedErrors: InventoryCountFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
