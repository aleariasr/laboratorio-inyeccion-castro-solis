import {
  apiDelete,
  apiGet,
  apiGetBlob,
  apiPatch,
  apiPost,
} from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  Branch,
  StockTransfer,
  StockTransferFilters,
  StockTransferItem,
  StockTransferWritePayload,
} from "./types";

const TRANSFERS_PATH = "/api/inventory/stock-transfers/";
const ITEMS_PATH = "/api/inventory/stock-transfer-items/";
const BRANCHES_PATH = "/api/inventory/branches/";

export function getStockTransfers(
  token: string,
  filters: StockTransferFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<StockTransfer>> {
  const searchParams = new URLSearchParams();
  const query = filters.query.trim();

  if (query) {
    searchParams.set("q", query);
  }

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  searchParams.set("page", String(filters.page));
  searchParams.set("page_size", String(filters.pageSize));

  return apiGet<PaginatedResponse<StockTransfer>>(
    `${TRANSFERS_PATH}?${searchParams.toString()}`,
    { token, signal },
  );
}

export function getStockTransfer(
  token: string,
  transferId: number,
  signal?: AbortSignal,
): Promise<StockTransfer> {
  return apiGet<StockTransfer>(`${TRANSFERS_PATH}${transferId}/`, { token, signal });
}

export function createStockTransfer(
  token: string,
  payload: StockTransferWritePayload,
): Promise<StockTransfer> {
  return apiPost<StockTransfer>(TRANSFERS_PATH, payload, { token });
}

export function updateStockTransfer(
  token: string,
  transferId: number,
  payload: StockTransferWritePayload,
): Promise<StockTransfer> {
  return apiPatch<StockTransfer>(`${TRANSFERS_PATH}${transferId}/`, payload, { token });
}

export function deleteStockTransfer(token: string, transferId: number): Promise<null> {
  return apiDelete(`${TRANSFERS_PATH}${transferId}/`, { token });
}

export function confirmStockTransfer(token: string, transferId: number): Promise<StockTransfer> {
  return apiPost<StockTransfer>(`${TRANSFERS_PATH}${transferId}/confirm/`, {}, { token });
}

/** El motivo es obligatorio solo si el traslado ya está confirmado. */
export function cancelStockTransfer(
  token: string,
  transferId: number,
  reason: string,
): Promise<StockTransfer> {
  return apiPost<StockTransfer>(
    `${TRANSFERS_PATH}${transferId}/cancel/`,
    { reason },
    { token },
  );
}

export function getStockTransferGuidePdf(token: string, transferId: number): Promise<Blob> {
  return apiGetBlob(`${TRANSFERS_PATH}${transferId}/guide/`, {
    token,
    timeoutMs: 30_000,
  });
}

export function createStockTransferItem(
  token: string,
  payload: { stock_transfer: number; product: number; quantity: number },
): Promise<StockTransferItem> {
  return apiPost<StockTransferItem>(ITEMS_PATH, payload, { token });
}

export function updateStockTransferItem(
  token: string,
  itemId: number,
  quantity: number,
): Promise<StockTransferItem> {
  return apiPatch<StockTransferItem>(`${ITEMS_PATH}${itemId}/`, { quantity }, { token });
}

export function deleteStockTransferItem(token: string, itemId: number): Promise<null> {
  return apiDelete(`${ITEMS_PATH}${itemId}/`, { token });
}

export function getActiveBranches(token: string, signal?: AbortSignal): Promise<Branch[]> {
  return apiGet<Branch[]>(`${BRANCHES_PATH}?is_active=true`, { token, signal });
}

export function createBranch(token: string, name: string): Promise<Branch> {
  return apiPost<Branch>(BRANCHES_PATH, { name }, { token });
}
