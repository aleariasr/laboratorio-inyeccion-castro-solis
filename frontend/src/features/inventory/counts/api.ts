import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
} from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  InventoryCount,
  InventoryCountFilters,
  InventoryCountItem,
  InventoryCountItemWritePayload,
  InventoryCountWritePayload,
} from "./types";

function buildInventoryCountsQuery(
  filters: InventoryCountFilters,
): string {
  const searchParams = new URLSearchParams();

  const normalizedQuery = filters.query.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
  }

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }

  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }

  if (filters.activeState === "active") {
    searchParams.set("is_active", "true");
  }

  if (filters.activeState === "inactive") {
    searchParams.set("is_active", "false");
  }

  searchParams.set("page", String(filters.page));
  searchParams.set(
    "page_size",
    String(filters.pageSize),
  );

  return searchParams.toString();
}

async function getAllPages<T>(
  buildPath: (page: number) => string,
  token: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const response = await apiGet<PaginatedResponse<T>>(
      buildPath(page),
      {
        token,
        signal,
      },
    );

    results.push(...response.results);

    if (
      response.next === null ||
      response.results.length === 0 ||
      results.length >= response.count
    ) {
      return results;
    }

    page += 1;
  }
}

export function getInventoryCounts(
  token: string,
  filters: InventoryCountFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<InventoryCount>> {
  const query = buildInventoryCountsQuery(filters);

  return apiGet<PaginatedResponse<InventoryCount>>(
    `/api/inventory/inventory-counts/?${query}`,
    {
      token,
      signal,
    },
  );
}

export function getInventoryCount(
  token: string,
  inventoryCountId: number,
  signal?: AbortSignal,
): Promise<InventoryCount> {
  return apiGet<InventoryCount>(
    `/api/inventory/inventory-counts/${inventoryCountId}/`,
    {
      token,
      signal,
    },
  );
}

export function createInventoryCount(
  token: string,
  payload: InventoryCountWritePayload,
): Promise<InventoryCount> {
  return apiPost<InventoryCount>(
    "/api/inventory/inventory-counts/",
    payload,
    {
      token,
    },
  );
}

export function updateInventoryCount(
  token: string,
  inventoryCountId: number,
  payload: InventoryCountWritePayload,
): Promise<InventoryCount> {
  return apiPatch<InventoryCount>(
    `/api/inventory/inventory-counts/${inventoryCountId}/`,
    payload,
    {
      token,
    },
  );
}

export function deleteInventoryCount(
  token: string,
  inventoryCountId: number,
): Promise<null> {
  return apiDelete(
    `/api/inventory/inventory-counts/${inventoryCountId}/`,
    {
      token,
    },
  );
}

export function approveInventoryCount(
  token: string,
  inventoryCountId: number,
): Promise<InventoryCount> {
  return apiPost<InventoryCount>(
    `/api/inventory/inventory-counts/${inventoryCountId}/approve/`,
    {},
    {
      token,
    },
  );
}

export function cancelInventoryCount(
  token: string,
  inventoryCountId: number,
): Promise<InventoryCount> {
  return apiPost<InventoryCount>(
    `/api/inventory/inventory-counts/${inventoryCountId}/cancel/`,
    {},
    {
      token,
    },
  );
}

export function getInventoryCountItems(
  token: string,
  inventoryCountId: number,
  signal?: AbortSignal,
): Promise<InventoryCountItem[]> {
  return getAllPages<InventoryCountItem>(
    (page) => {
      const searchParams = new URLSearchParams({
        inventory_count: String(inventoryCountId),
        page: String(page),
        page_size: "100",
      });

      return `/api/inventory/inventory-count-items/?${searchParams.toString()}`;
    },
    token,
    signal,
  );
}

export function createInventoryCountItem(
  token: string,
  payload: InventoryCountItemWritePayload,
): Promise<InventoryCountItem> {
  return apiPost<InventoryCountItem>(
    "/api/inventory/inventory-count-items/",
    payload,
    {
      token,
    },
  );
}

export function updateInventoryCountItem(
  token: string,
  inventoryCountItemId: number,
  payload: Partial<InventoryCountItemWritePayload>,
): Promise<InventoryCountItem> {
  return apiPatch<InventoryCountItem>(
    `/api/inventory/inventory-count-items/${inventoryCountItemId}/`,
    payload,
    {
      token,
    },
  );
}

export function deleteInventoryCountItem(
  token: string,
  inventoryCountItemId: number,
): Promise<null> {
  return apiDelete(
    `/api/inventory/inventory-count-items/${inventoryCountItemId}/`,
    {
      token,
    },
  );
}
