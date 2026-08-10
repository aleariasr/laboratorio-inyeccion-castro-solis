import type { ApiFieldErrors } from "@/lib/api/types";

import type { InjectorFormErrors, InjectorFormField } from "./types";

const FIELD_MAP: Record<string, InjectorFormField> = {
  customer: "customerId",
  injector_number: "injectorNumber",
  description: "description",
  notes: "notes",
  is_active: "isActive",
};

export function mapInjectorApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): InjectorFormErrors {
  const mappedErrors: InjectorFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
