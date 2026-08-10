import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  Accessory,
  AccessoryWritePayload,
  ServiceAccessory,
  ServiceAccessoryWritePayload,
  ServiceRecord,
  ServiceRecordCreatePayload,
  ServiceRecordFilters,
  ServiceRecordTechnicalWritePayload,
} from "./types";

function buildServiceRecordsQuery(filters: ServiceRecordFilters): string {
  const searchParams = new URLSearchParams();

  const normalizedQuery = filters.query.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
  }

  if (filters.injectorId) {
    searchParams.set("injector", String(filters.injectorId));
  }

  if (filters.customerId) {
    searchParams.set("customer", String(filters.customerId));
  }

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  if (filters.activeState === "active") {
    searchParams.set("is_active", "true");
  }

  if (filters.activeState === "inactive") {
    searchParams.set("is_active", "false");
  }

  if (filters.receivedFrom) {
    searchParams.set("received_from", filters.receivedFrom);
  }

  if (filters.receivedTo) {
    searchParams.set("received_to", filters.receivedTo);
  }

  searchParams.set("page", String(filters.page));
  searchParams.set("page_size", String(filters.pageSize));

  return searchParams.toString();
}

export function getServiceRecords(
  token: string,
  filters: ServiceRecordFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<ServiceRecord>> {
  const query = buildServiceRecordsQuery(filters);

  return apiGet<PaginatedResponse<ServiceRecord>>(
    `/api/customers/service-records/?${query}`,
    {
      token,
      signal,
    },
  );
}

export function getServiceRecord(
  token: string,
  serviceRecordId: number,
  signal?: AbortSignal,
): Promise<ServiceRecord> {
  return apiGet<ServiceRecord>(
    `/api/customers/service-records/${serviceRecordId}/`,
    {
      token,
      signal,
    },
  );
}

export function createServiceRecord(
  token: string,
  payload: ServiceRecordCreatePayload,
): Promise<ServiceRecord> {
  return apiPost<ServiceRecord>("/api/customers/service-records/", payload, {
    token,
  });
}

export function updateServiceRecordTechnicalData(
  token: string,
  serviceRecordId: number,
  payload: ServiceRecordTechnicalWritePayload,
): Promise<ServiceRecord> {
  return apiPatch<ServiceRecord>(
    `/api/customers/service-records/${serviceRecordId}/`,
    payload,
    {
      token,
    },
  );
}

export function startServiceRecord(
  token: string,
  serviceRecordId: number,
): Promise<ServiceRecord> {
  return apiPost<ServiceRecord>(
    `/api/customers/service-records/${serviceRecordId}/start/`,
    {},
    {
      token,
    },
  );
}

export function markServiceRecordReady(
  token: string,
  serviceRecordId: number,
): Promise<ServiceRecord> {
  return apiPost<ServiceRecord>(
    `/api/customers/service-records/${serviceRecordId}/mark-ready/`,
    {},
    {
      token,
    },
  );
}

export function deliverServiceRecord(
  token: string,
  serviceRecordId: number,
): Promise<ServiceRecord> {
  return apiPost<ServiceRecord>(
    `/api/customers/service-records/${serviceRecordId}/deliver/`,
    {},
    {
      token,
    },
  );
}

export function cancelServiceRecord(
  token: string,
  serviceRecordId: number,
): Promise<ServiceRecord> {
  return apiPost<ServiceRecord>(
    `/api/customers/service-records/${serviceRecordId}/cancel/`,
    {},
    {
      token,
    },
  );
}

// Accesorios: catálogo global, gestionado inline (igual que las
// categorías de costos de importación en Compras)
export function getAccessories(
  token: string,
  query: string,
  signal?: AbortSignal,
): Promise<Accessory[]> {
  const searchParams = new URLSearchParams({
    q: query,
    is_active: "true",
    page: "1",
    page_size: "100",
  });

  return apiGet<PaginatedResponse<Accessory>>(
    `/api/customers/accessories/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  ).then((response) => response.results);
}

export function createAccessory(
  token: string,
  payload: AccessoryWritePayload,
): Promise<Accessory> {
  return apiPost<Accessory>("/api/customers/accessories/", payload, {
    token,
  });
}

// Líneas de accesorios usados en un servicio
export function getServiceAccessories(
  token: string,
  serviceRecordId: number,
  signal?: AbortSignal,
): Promise<ServiceAccessory[]> {
  const searchParams = new URLSearchParams({
    service_record: String(serviceRecordId),
    page: "1",
    page_size: "50",
  });

  return apiGet<PaginatedResponse<ServiceAccessory>>(
    `/api/customers/service-accessories/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  ).then((response) => response.results);
}

export function createServiceAccessory(
  token: string,
  payload: ServiceAccessoryWritePayload,
): Promise<ServiceAccessory> {
  return apiPost<ServiceAccessory>("/api/customers/service-accessories/", payload, {
    token,
  });
}

export function updateServiceAccessory(
  token: string,
  serviceAccessoryId: number,
  payload: { quantity: number; notes: string },
): Promise<ServiceAccessory> {
  return apiPatch<ServiceAccessory>(
    `/api/customers/service-accessories/${serviceAccessoryId}/`,
    payload,
    {
      token,
    },
  );
}

export function deleteServiceAccessory(
  token: string,
  serviceAccessoryId: number,
): Promise<null> {
  return apiDelete(`/api/customers/service-accessories/${serviceAccessoryId}/`, {
    token,
  });
}
