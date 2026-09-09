import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  ServiceAccessoryFormErrors,
  ServiceAccessoryFormField,
  ServicePriceFormErrors,
  ServicePriceFormField,
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
  inductance: "inductance",
  isolation: "isolation",
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

const PRICE_FIELD_MAP: Record<string, ServicePriceFormField> = {
  price: "price",
  payment_method: "paymentMethod",
  service_type: "serviceTypeId",
};

export function mapServicePriceApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): ServicePriceFormErrors {
  const mappedErrors: ServicePriceFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = PRICE_FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}

const SERVICE_ACCESSORY_FIELD_MAP: Record<string, ServiceAccessoryFormField> = {
  product: "productId",
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
