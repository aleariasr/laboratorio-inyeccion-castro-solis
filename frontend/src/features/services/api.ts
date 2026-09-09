import { apiDelete, apiGet, apiGetBlob, apiPatch, apiPost } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  ServiceAccessory,
  ServiceAccessoryWritePayload,
  ServicePriceWritePayload,
  ServiceRecord,
  ServiceRecordCreatePayload,
  ServiceRecordFilters,
  ServiceRecordTechnicalWritePayload,
  ServiceType,
  ServiceTypePriceHistory,
  ServiceTypeWritePayload,
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

export function updateServiceRecordPrice(
  token: string,
  serviceRecordId: number,
  payload: ServicePriceWritePayload,
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

// Líneas de accesorios usados en un servicio. El accesorio es un
// producto real del inventario (ver ../inventory/suppliers/api para
// searchActiveProducts, reutilizado para el buscador del formulario).
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

export function deleteServiceAccessory(
  token: string,
  serviceAccessoryId: number,
): Promise<null> {
  return apiDelete(`/api/customers/service-accessories/${serviceAccessoryId}/`, {
    token,
  });
}

// Tipo de servicio: catálogo persistente, gestionado inline (mismo patrón
// que los accesorios de arriba).
export function getServiceTypes(
  token: string,
  query: string,
  signal?: AbortSignal,
): Promise<ServiceType[]> {
  const searchParams = new URLSearchParams({
    q: query,
    is_active: "true",
    page: "1",
    page_size: "100",
  });

  return apiGet<PaginatedResponse<ServiceType>>(
    `/api/customers/service-types/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  ).then((response) => response.results);
}

export function createServiceType(
  token: string,
  payload: ServiceTypeWritePayload,
): Promise<ServiceType> {
  return apiPost<ServiceType>("/api/customers/service-types/", payload, {
    token,
  });
}

export function getLatestServiceTypePriceHistory(
  token: string,
  serviceTypeId: number,
  signal?: AbortSignal,
): Promise<ServiceTypePriceHistory | null> {
  const searchParams = new URLSearchParams({
    service_type: String(serviceTypeId),
    page: "1",
    page_size: "1",
  });

  return apiGet<PaginatedResponse<ServiceTypePriceHistory>>(
    `/api/customers/service-type-price-history/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  ).then((response) => response.results[0] ?? null);
}

export function getServiceInvoicePdf(
  token: string,
  serviceRecordId: number,
): Promise<Blob> {
  return apiGetBlob(`/api/documents/services/${serviceRecordId}/invoice/`, {
    token,
    timeoutMs: 30_000,
  });
}
