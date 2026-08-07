import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  SupplierFormErrors,
  SupplierFormField,
} from "./types";

const FIELD_MAP: Record<string, SupplierFormField> = {
  name: "name",
  contact_name: "contactName",
  phone: "phone",
  email: "email",
  country: "country",
  notes: "notes",
  is_active: "isActive",
};

export function mapSupplierApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): SupplierFormErrors {
  const mappedErrors: SupplierFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
