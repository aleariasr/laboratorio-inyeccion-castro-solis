import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  ServiceAccessoryFormErrors,
  ServiceAccessoryFormField,
  ServiceRecordCreateFormErrors,
  ServiceRecordCreateFormField,
  ServiceRecordTechnicalFormErrors,
  ServiceRecordTechnicalFormField,
} from "./types";

const CREATE_FIELD_MAP: Record<string, ServiceRecordCreateFormField> = {
  injector: "injectorId",
  received_at: "receivedAt",
};

export function mapServiceRecordCreateApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): ServiceRecordCreateFormErrors {
  const mappedErrors: ServiceRecordCreateFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = CREATE_FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}

const TECHNICAL_FIELD_MAP: Record<string, ServiceRecordTechnicalFormField> = {
  resistance: "resistance",
  leakage: "leakage",
  notes_before: "notesBefore",
  notes_after: "notesAfter",
  observations: "observations",
};

export function mapServiceRecordTechnicalApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): ServiceRecordTechnicalFormErrors {
  const mappedErrors: ServiceRecordTechnicalFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = TECHNICAL_FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}

const SERVICE_ACCESSORY_FIELD_MAP: Record<string, ServiceAccessoryFormField> = {
  accessory: "accessoryId",
  quantity: "quantity",
  notes: "notes",
};

export function mapServiceAccessoryApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): ServiceAccessoryFormErrors {
  const mappedErrors: ServiceAccessoryFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = SERVICE_ACCESSORY_FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
