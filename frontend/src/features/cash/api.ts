import { apiDelete, apiGet, apiGetBlob, apiPost } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  CashClosing,
  CashClosingFilters,
  CashClosingPreview,
  CashClosingWritePayload,
  CloseableWeeks,
  PettyCashMovement,
  PettyCashMovementWritePayload,
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

  if (filters.query.trim()) {
    searchParams.set("q", filters.query.trim());
  }

  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }

  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }

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

export function getCloseableWeeks(
  token: string,
  signal?: AbortSignal,
): Promise<CloseableWeeks> {
  return apiGet<CloseableWeeks>("/api/cash/closings/closeable_weeks/", {
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

/** Salidas de caja chica de la semana que empieza en weekStart (sábado). */
export function getPettyCashMovements(
  token: string,
  weekStart: string,
  signal?: AbortSignal,
): Promise<PettyCashMovement[]> {
  const searchParams = new URLSearchParams({ week_start: weekStart });

  return apiGet<PettyCashMovement[]>(
    `/api/cash/petty-cash/?${searchParams.toString()}`,
    { token, signal },
  );
}

export function createPettyCashMovement(
  token: string,
  payload: PettyCashMovementWritePayload,
): Promise<PettyCashMovement> {
  return apiPost<PettyCashMovement>("/api/cash/petty-cash/", payload, {
    token,
  });
}

export function deletePettyCashMovement(
  token: string,
  movementId: number,
): Promise<null> {
  return apiDelete(`/api/cash/petty-cash/${movementId}/`, { token });
}

/** PDF de un cierre para archivar o imprimir (puntos 2 + 27). */
export function getCashClosingPdf(token: string, closingId: number): Promise<Blob> {
  return apiGetBlob(`/api/cash/closings/${closingId}/pdf/`, {
    token,
    timeoutMs: 60_000,
  });
}
