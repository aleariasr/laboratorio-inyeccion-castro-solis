import type { ApiFieldErrors } from "@/lib/api/types";

import type { UserFormErrors, UserFormField } from "./types";

const FIELD_MAP: Record<string, UserFormField> = {
  username: "username",
  password: "password",
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  is_active: "isActive",
  is_staff: "isStaff",
  groups: "groups",
  permissions: "permissions",
};

export function mapUserApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): UserFormErrors {
  const mappedErrors: UserFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
