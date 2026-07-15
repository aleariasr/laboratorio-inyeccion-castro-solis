import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
  getApiErrorMessage,
} from "./errors";
import type { ApiRequestOptions } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;

function createRequestHeaders({
  headers,
  token,
  hasBody,
}: {
  headers?: HeadersInit;
  token?: string | null;
  hasBody: boolean;
}): Headers {
  const requestHeaders = new Headers(headers);

  requestHeaders.set("Accept", "application/json");

  if (hasBody && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (token) {
    requestHeaders.set("Authorization", `Token ${token}`);
  }

  return requestHeaders;
}

async function parseResponseBody(
  response: Response,
): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  return text || null;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    token,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers,
    signal,
    ...requestOptions
  } = options;

  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
        timeoutController.abort();
    }, timeoutMs);

  const abortRequest = () => {
    timeoutController.abort();
  };

  signal?.addEventListener("abort", abortRequest, {
    once: true,
  });

  try {
    const response = await fetch(path, {
      ...requestOptions,
      headers: createRequestHeaders({
        headers,
        token,
        hasBody: body !== undefined,
      }),
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal: timeoutController.signal,
    });

    const payload = await parseResponseBody(response);

    if (!response.ok) {
      throw new ApiError({
        message: getApiErrorMessage(payload),
        status: response.status,
        payload,
      });
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      if (signal?.aborted) {
        throw error;
      }

      throw new ApiTimeoutError();
    }

    throw new ApiNetworkError();
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortRequest);
  }
}

export function apiGet<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    method: "GET",
  });
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    method: "POST",
    body,
  });
}

export function apiPatch<T>(
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    method: "PATCH",
    body,
  });
}

export function apiDelete(
  path: string,
  options: ApiRequestOptions = {},
): Promise<null> {
  return apiRequest<null>(path, {
    ...options,
    method: "DELETE",
  });
}