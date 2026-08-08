import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
} from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  CostSummary,
  ImportCost,
  ImportCostCategory,
  ImportCostCategoryWritePayload,
  ImportCostWritePayload,
  ProductCostHistory,
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

export function getImportCostCategories(
  token: string,
  signal?: AbortSignal,
): Promise<ImportCostCategory[]> {
  return getAllPages<ImportCostCategory>(
    (page) => {
      const searchParams = new URLSearchParams({
        is_active: "true",
        page: String(page),
        page_size: "100",
      });

      return `/api/inventory/import-cost-categories/?${searchParams.toString()}`;
    },
    token,
    signal,
  );
}

export function createImportCostCategory(
  token: string,
  payload: ImportCostCategoryWritePayload,
): Promise<ImportCostCategory> {
  return apiPost<ImportCostCategory>(
    "/api/inventory/import-cost-categories/",
    payload,
    {
      token,
    },
  );
}

export function getImportCosts(
  token: string,
  purchaseId: number,
  signal?: AbortSignal,
): Promise<ImportCost[]> {
  return getAllPages<ImportCost>(
    (page) => {
      const searchParams = new URLSearchParams({
        purchase: String(purchaseId),
        page: String(page),
        page_size: "100",
      });

      return `/api/inventory/import-costs/?${searchParams.toString()}`;
    },
    token,
    signal,
  );
}

export function createImportCost(
  token: string,
  payload: ImportCostWritePayload,
): Promise<ImportCost> {
  return apiPost<ImportCost>(
    "/api/inventory/import-costs/",
    payload,
    {
      token,
    },
  );
}

export function updateImportCost(
  token: string,
  importCostId: number,
  payload: Partial<ImportCostWritePayload> & { is_active?: boolean },
): Promise<ImportCost> {
  return apiPatch<ImportCost>(
    `/api/inventory/import-costs/${importCostId}/`,
    payload,
    {
      token,
    },
  );
}

export function getCostSummary(
  token: string,
  purchaseId: number,
  marginPercentage: string,
  signal?: AbortSignal,
): Promise<CostSummary> {
  const searchParams = new URLSearchParams({
    margin_percentage: marginPercentage,
  });

  return apiGet<CostSummary>(
    `/api/inventory/purchases/${purchaseId}/cost-summary/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  );
}

export function calculatePurchaseCosts(
  token: string,
  purchaseId: number,
  marginPercentage: string,
): Promise<ProductCostHistory[]> {
  return apiPost<ProductCostHistory[]>(
    `/api/inventory/purchases/${purchaseId}/calculate-costs/`,
    {
      margin_percentage: marginPercentage,
    },
    {
      token,
    },
  );
}

export function getProductCostHistory(
  token: string,
  purchaseId: number,
  signal?: AbortSignal,
): Promise<ProductCostHistory[]> {
  return getAllPages<ProductCostHistory>(
    (page) => {
      const searchParams = new URLSearchParams({
        purchase: String(purchaseId),
        page: String(page),
        page_size: "100",
      });

      return `/api/inventory/product-cost-history/?${searchParams.toString()}`;
    },
    token,
    signal,
  );
}
