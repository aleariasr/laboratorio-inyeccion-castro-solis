import { apiGet, apiPatch, apiPost } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  Injector,
  InjectorFilters,
  InjectorServiceRecordSummary,
  InjectorWritePayload,
} from "./types";

function buildInjectorsQuery(filters: InjectorFilters): string {
  const searchParams = new URLSearchParams();

  const normalizedQuery = filters.query.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
  }

  if (filters.customerId) {
    searchParams.set("customer", String(filters.customerId));
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

export function getInjectors(
  token: string,
  filters: InjectorFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Injector>> {
  const query = buildInjectorsQuery(filters);

  return apiGet<PaginatedResponse<Injector>>(
    `/api/customers/injectors/?${query}`,
    {
      token,
      signal,
    },
  );
}

export function getInjector(
  token: string,
  injectorId: number,
  signal?: AbortSignal,
): Promise<Injector> {
  return apiGet<Injector>(`/api/customers/injectors/${injectorId}/`, {
    token,
    signal,
  });
}

export function createInjector(
  token: string,
  payload: InjectorWritePayload,
): Promise<Injector> {
  return apiPost<Injector>("/api/customers/injectors/", payload, {
    token,
  });
}

export function updateInjector(
  token: string,
  injectorId: number,
  payload: Partial<InjectorWritePayload>,
): Promise<Injector> {
  return apiPatch<Injector>(`/api/customers/injectors/${injectorId}/`, payload, {
    token,
  });
}

// Servicios del inyector (solo lectura hasta implementar el módulo de
// servicios). Reutiliza el filtro ?injector= que ya expone
// InjectorServiceRecordViewSet.
export function getInjectorServiceRecords(
  token: string,
  injectorId: number,
  signal?: AbortSignal,
): Promise<InjectorServiceRecordSummary[]> {
  const searchParams = new URLSearchParams({
    injector: String(injectorId),
    page: "1",
    page_size: "20",
  });

  return apiGet<PaginatedResponse<InjectorServiceRecordSummary>>(
    `/api/customers/service-records/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  ).then((response) => response.results);
}
