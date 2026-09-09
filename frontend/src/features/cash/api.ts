import { apiGet, apiPost } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  CashClosing,
  CashClosingFilters,
  CashClosingPreview,
  CashClosingWritePayload,
} from "./types";

export function getCashClosings(
  token: string,
  filters: CashClosingFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<CashClosing>> {
  const searchParams = new URLSearchParams({
    page: String(filters.page),
    page_size: String(filters.pageSize),
  });

  return apiGet<PaginatedResponse<CashClosing>>(
    `/api/cash/closings/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  );
}

export function getCashClosing(
  token: string,
  closingId: number,
  signal?: AbortSignal,
): Promise<CashClosing> {
  return apiGet<CashClosing>(`/api/cash/closings/${closingId}/`, {
    token,
    signal,
  });
}

export function getCashClosingPreview(
  token: string,
  weekStart: string,
  signal?: AbortSignal,
): Promise<CashClosingPreview> {
  const searchParams = new URLSearchParams({
    week_start: weekStart,
  });

  return apiGet<CashClosingPreview>(
    `/api/cash/closings/preview/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  );
}

export function createCashClosing(
  token: string,
  payload: CashClosingWritePayload,
): Promise<CashClosing> {
  return apiPost<CashClosing>("/api/cash/closings/", payload, {
    token,
  });
}
