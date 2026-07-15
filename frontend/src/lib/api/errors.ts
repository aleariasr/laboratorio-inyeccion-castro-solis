import type { ApiFieldErrors } from "./types";

const DEFAULT_ERROR_MESSAGE =
  "No fue posible completar la solicitud.";

function normalizeMessages(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(normalizeMessages);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(normalizeMessages);
  }

  return [];
}

export function normalizeFieldErrors(
  payload: unknown,
): ApiFieldErrors {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => key !== "detail")
      .map(([key, value]) => [key, normalizeMessages(value)])
      .filter(([, messages]) => messages.length > 0),
  );
}

export function getApiErrorMessage(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }

  const fieldErrors = normalizeFieldErrors(payload);
  const firstMessage = Object.values(fieldErrors).flat()[0];

  return firstMessage ?? DEFAULT_ERROR_MESSAGE;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  readonly fieldErrors: ApiFieldErrors;

  constructor({
    message,
    status,
    payload,
  }: {
    message: string;
    status: number;
    payload: unknown;
  }) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.fieldErrors = normalizeFieldErrors(payload);
  }
}

export class ApiNetworkError extends Error {
  constructor(
    message = "No fue posible comunicarse con el sistema local.",
  ) {
    super(message);
    this.name = "ApiNetworkError";
  }
}

export class ApiTimeoutError extends Error {
  constructor(
    message = "La solicitud tardó demasiado tiempo en responder.",
  ) {
    super(message);
    this.name = "ApiTimeoutError";
  }
}