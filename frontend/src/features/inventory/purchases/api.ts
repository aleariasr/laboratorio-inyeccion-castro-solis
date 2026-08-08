import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
} from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  Purchase,
  PurchaseFilters,
  PurchaseItemInline,
  PurchaseItemWritePayload,
  PurchaseWritePayload,
  SupplierProduct,
} from "./types";

function buildPurchasesQuery(
  filters: PurchaseFilters,
): string {
  const searchParams = new URLSearchParams();

  const normalizedQuery = filters.query.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
  }

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  if (filters.currency) {
    searchParams.set("currency", filters.currency);
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

export function getPurchases(
  token: string,
  filters: PurchaseFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Purchase>> {
  const query = buildPurchasesQuery(filters);

  return apiGet<PaginatedResponse<Purchase>>(
    `/api/inventory/purchases/?${query}`,
    {
      token,
      signal,
    },
  );
}

export function getPurchase(
  token: string,
  purchaseId: number,
  signal?: AbortSignal,
): Promise<Purchase> {
  return apiGet<Purchase>(
    `/api/inventory/purchases/${purchaseId}/`,
    {
      token,
      signal,
    },
  );
}

export function createPurchase(
  token: string,
  payload: PurchaseWritePayload,
): Promise<Purchase> {
  return apiPost<Purchase>(
    "/api/inventory/purchases/",
    payload,
    {
      token,
    },
  );
}

export function updatePurchase(
  token: string,
  purchaseId: number,
  payload: PurchaseWritePayload,
): Promise<Purchase> {
  return apiPatch<Purchase>(
    `/api/inventory/purchases/${purchaseId}/`,
    payload,
    {
      token,
    },
  );
}

export function confirmPurchase(
  token: string,
  purchaseId: number,
): Promise<Purchase> {
  return apiPost<Purchase>(
    `/api/inventory/purchases/${purchaseId}/confirm/`,
    {},
    {
      token,
    },
  );
}

export function cancelPurchase(
  token: string,
  purchaseId: number,
  reason: string,
): Promise<Purchase> {
  return apiPost<Purchase>(
    `/api/inventory/purchases/${purchaseId}/cancel/`,
    {
      reason,
    },
    {
      token,
    },
  );
}

export function createPurchaseItem(
  token: string,
  payload: PurchaseItemWritePayload,
): Promise<PurchaseItemInline> {
  return apiPost<PurchaseItemInline>(
    "/api/inventory/purchase-items/",
    payload,
    {
      token,
    },
  );
}

export function updatePurchaseItem(
  token: string,
  purchaseItemId: number,
  payload: Partial<PurchaseItemWritePayload>,
): Promise<PurchaseItemInline> {
  return apiPatch<PurchaseItemInline>(
    `/api/inventory/purchase-items/${purchaseItemId}/`,
    payload,
    {
      token,
    },
  );
}

export function deletePurchaseItem(
  token: string,
  purchaseItemId: number,
): Promise<null> {
  return apiDelete(
    `/api/inventory/purchase-items/${purchaseItemId}/`,
    {
      token,
    },
  );
}

export function searchSupplierProducts(
  token: string,
  supplierId: number,
  query: string,
  signal?: AbortSignal,
): Promise<SupplierProduct[]> {
  const searchParams = new URLSearchParams({
    supplier: String(supplierId),
    q: query,
    is_active: "true",
    page: "1",
    page_size: "20",
  });

  return apiGet<PaginatedResponse<SupplierProduct>>(
    `/api/inventory/supplier-products/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  ).then((response) => response.results);
}
