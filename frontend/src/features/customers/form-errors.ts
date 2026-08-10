import type { ApiFieldErrors } from "@/lib/api/types";

import type { CustomerFormErrors, CustomerFormField } from "./types";

const FIELD_MAP: Record<string, CustomerFormField> = {
  customer_type: "customerType",
  display_name: "displayName",
  phone: "phone",
  email: "email",
  identification: "identification",
  notes: "notes",
  is_active: "isActive",
};

export function mapCustomerApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): CustomerFormErrors {
  const mappedErrors: CustomerFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
