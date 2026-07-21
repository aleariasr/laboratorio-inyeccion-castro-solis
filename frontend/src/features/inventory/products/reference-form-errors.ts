import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  ProductReferenceFormErrors,
  ProductReferenceFormField,
} from "./types";

const FIELD_MAP: Record<
  string,
  ProductReferenceFormField
> = {
  manufacturer: "manufacturer",
  reference_code: "referenceCode",
  description: "description",
  is_active: "isActive",
};

export function mapProductReferenceApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): ProductReferenceFormErrors {
  const mappedErrors:
    ProductReferenceFormErrors = {};

  for (
    const [apiField, messages]
    of Object.entries(fieldErrors)
  ) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] =
        firstMessage;
    }
  }

  return mappedErrors;
}
