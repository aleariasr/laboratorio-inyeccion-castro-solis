import {
  apiGet,
  apiPatch,
  apiPost,
} from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  StorageLocation,
  StorageLocationFilters,
  StorageLocationWritePayload,
} from "./types";

function buildStorageLocationsQuery(
  filters: StorageLocationFilters,
): string {
  const searchParams =
    new URLSearchParams();

  const normalizedQuery =
    filters.query.trim();

  if (normalizedQuery) {
    searchParams.set(
      "q",
      normalizedQuery,
    );
  }

  if (
    filters.activeState === "active"
  ) {
    searchParams.set(
      "is_active",
      "true",
    );
  }

  if (
    filters.activeState === "inactive"
  ) {
    searchParams.set(
      "is_active",
      "false",
    );
  }

  searchParams.set(
    "page",
    String(filters.page),
  );

  searchParams.set(
    "page_size",
    String(filters.pageSize),
  );

  return searchParams.toString();
}

export function getStorageLocations(
  token: string,
  filters: StorageLocationFilters,
  signal?: AbortSignal,
): Promise<
  PaginatedResponse<StorageLocation>
> {
  const query =
    buildStorageLocationsQuery(filters);

  return apiGet<
    PaginatedResponse<StorageLocation>
  >(
    `/api/inventory/locations/?${query}`,
    {
      token,
      signal,
    },
  );
}

export function getStorageLocation(
  token: string,
  locationId: number,
  signal?: AbortSignal,
): Promise<StorageLocation> {
  return apiGet<StorageLocation>(
    `/api/inventory/locations/${locationId}/`,
    {
      token,
      signal,
    },
  );
}

export function createStorageLocation(
  token: string,
  payload: StorageLocationWritePayload,
): Promise<StorageLocation> {
  return apiPost<StorageLocation>(
    "/api/inventory/locations/",
    payload,
    {
      token,
    },
  );
}

export function updateStorageLocation(
  token: string,
  locationId: number,
  payload: StorageLocationWritePayload,
): Promise<StorageLocation> {
  return apiPatch<StorageLocation>(
    `/api/inventory/locations/${locationId}/`,
    payload,
    {
      token,
    },
  );
}