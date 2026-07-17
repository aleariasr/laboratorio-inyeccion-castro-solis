import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  ProductFormErrors,
  ProductFormField,
} from "./types";

const FIELD_MAP: Record<
  string,
  ProductFormField
> = {
  standard_code: "standardCode",
  name: "name",
  description: "description",
  storage_location: "storageLocationId",
  minimum_stock: "minimumStock",
  unit_of_measure: "unitOfMeasure",
  is_active: "isActive",
};

export function mapProductApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): ProductFormErrors {
  const mappedErrors: ProductFormErrors = {};

  for (const [apiField, messages] of Object.entries(
    fieldErrors,
  )) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
