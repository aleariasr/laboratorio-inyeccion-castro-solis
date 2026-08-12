import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
} from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  CustomerSummary,
  ProductCostHistory,
  Sale,
  SaleFilters,
  SaleItemInline,
  SaleItemWritePayload,
  SaleWritePayload,
} from "./types";

function buildSalesQuery(filters: SaleFilters): string {
  const searchParams = new URLSearchParams();

  const normalizedQuery = filters.query.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
  }

  if (filters.customerId !== undefined) {
    searchParams.set("customer", String(filters.customerId));
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
  searchParams.set("page_size", String(filters.pageSize));

  return searchParams.toString();
}

export function getSales(
  token: string,
  filters: SaleFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Sale>> {
  const query = buildSalesQuery(filters);

  return apiGet<PaginatedResponse<Sale>>(`/api/sales/sales/?${query}`, {
    token,
    signal,
  });
}

export function getSale(
  token: string,
  saleId: number,
  signal?: AbortSignal,
): Promise<Sale> {
  return apiGet<Sale>(`/api/sales/sales/${saleId}/`, {
    token,
    signal,
  });
}

export function createSale(
  token: string,
  payload: SaleWritePayload,
): Promise<Sale> {
  return apiPost<Sale>("/api/sales/sales/", payload, {
    token,
  });
}

export function updateSale(
  token: string,
  saleId: number,
  payload: SaleWritePayload,
): Promise<Sale> {
  return apiPatch<Sale>(`/api/sales/sales/${saleId}/`, payload, {
    token,
  });
}

export function confirmSale(
  token: string,
  saleId: number,
): Promise<Sale> {
  return apiPost<Sale>(`/api/sales/sales/${saleId}/confirm/`, {}, {
    token,
  });
}

export function cancelSale(
  token: string,
  saleId: number,
  reason: string,
): Promise<Sale> {
  return apiPost<Sale>(
    `/api/sales/sales/${saleId}/cancel/`,
    { reason },
    { token },
  );
}

export function createSaleItem(
  token: string,
  payload: SaleItemWritePayload,
): Promise<SaleItemInline> {
  return apiPost<SaleItemInline>("/api/sales/sale-items/", payload, {
    token,
  });
}

export function updateSaleItem(
  token: string,
  saleItemId: number,
  payload: Partial<SaleItemWritePayload>,
): Promise<SaleItemInline> {
  return apiPatch<SaleItemInline>(
    `/api/sales/sale-items/${saleItemId}/`,
    payload,
    { token },
  );
}

export function deleteSaleItem(
  token: string,
  saleItemId: number,
): Promise<null> {
  return apiDelete(`/api/sales/sale-items/${saleItemId}/`, {
    token,
  });
}

export function searchCustomers(
  token: string,
  query: string,
  signal?: AbortSignal,
): Promise<CustomerSummary[]> {
  const searchParams = new URLSearchParams({
    q: query,
    page: "1",
    page_size: "20",
  });

  return apiGet<PaginatedResponse<CustomerSummary>>(
    `/api/customers/customers/?${searchParams.toString()}`,
    { token, signal },
  ).then((response) => response.results);
}

export function getLatestProductCostHistory(
  token: string,
  productId: number,
  signal?: AbortSignal,
): Promise<ProductCostHistory | null> {
  const searchParams = new URLSearchParams({
    product: String(productId),
    page: "1",
    page_size: "1",
  });

  return apiGet<PaginatedResponse<ProductCostHistory>>(
    `/api/inventory/product-cost-history/?${searchParams.toString()}`,
    { token, signal },
  ).then((response) => response.results[0] ?? null);
}
