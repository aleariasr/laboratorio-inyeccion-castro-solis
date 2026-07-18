import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  StorageLocationFormErrors,
  StorageLocationFormField,
} from "./types";

const FIELD_MAP: Record<
  string,
  StorageLocationFormField
> = {
  code: "code",
  description: "description",
  is_active: "isActive",
};

export function mapStorageLocationApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): StorageLocationFormErrors {
  const mappedErrors:
    StorageLocationFormErrors = {};

  for (
    const [apiField, messages]
    of Object.entries(fieldErrors)
  ) {
    const formField =
      FIELD_MAP[apiField];

    const firstMessage =
      messages[0];

    if (
      formField &&
      firstMessage
    ) {
      mappedErrors[formField] =
        firstMessage;
    }
  }

  return mappedErrors;
}