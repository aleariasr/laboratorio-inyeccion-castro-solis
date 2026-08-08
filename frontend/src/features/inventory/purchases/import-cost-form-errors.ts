import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  ImportCostFormErrors,
  ImportCostFormField,
} from "./types";

const FIELD_MAP: Record<string, ImportCostFormField> = {
  category: "categoryId",
  description: "description",
  amount: "amount",
  currency: "currency",
  is_active: "isActive",
};

export function mapImportCostApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): ImportCostFormErrors {
  const mappedErrors: ImportCostFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
