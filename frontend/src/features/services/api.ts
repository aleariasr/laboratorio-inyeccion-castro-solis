import { apiDelete, apiGet, apiGetBlob, apiPatch, apiPost } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  ServiceAccessory,
  ServiceAccessoryUpdatePayload,
  ServiceAccessoryWritePayload,
  ServiceChargeLine,
  ServiceChargeLineWritePayload,
  ServicePriceWritePayload,
  ServiceRecord,
  ServiceReceptionPayload,
  ServiceRecordFilters,
  ServiceRecordTechnicalWritePayload,
  ServiceTypeDetail,
  ServiceTypeFilters,
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

/** Punto 1C: recibe uno o varios inyectores; devuelve los servicios creados. */
export function receiveInjectors(
  token: string,
  payload: ServiceReceptionPayload,
): Promise<ServiceRecord[]> {
  return apiPost<ServiceRecord[]>("/api/customers/service-records/receive/", payload, {
    token,
  });
}

/**
 * Punto 1C: corregir los datos de la recepción (inyector y fecha) mientras
 * el servicio no esté entregado ni anulado.
 */
export function updateServiceRecordReception(
  token: string,
  serviceRecordId: number,
  payload: { injector: number; received_at: string },
): Promise<ServiceRecord> {
  return apiPatch<ServiceRecord>(
    `/api/customers/service-records/${serviceRecordId}/`,
    payload,
    {
      token,
    },
  );
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

export function updateServiceAccessory(
  token: string,
  serviceAccessoryId: number,
  payload: ServiceAccessoryUpdatePayload,
): Promise<ServiceAccessory> {
  return apiPatch<ServiceAccessory>(
    `/api/customers/service-accessories/${serviceAccessoryId}/`,
    payload,
    {
      token,
    },
  );
}

export function getServiceChargeLines(
  token: string,
  serviceRecordId: number,
  signal?: AbortSignal,
): Promise<ServiceChargeLine[]> {
  return apiGet<ServiceChargeLine[]>(
    `/api/customers/service-charge-lines/?service_record=${serviceRecordId}`,
    {
      token,
      signal,
    },
  );
}

export function createServiceChargeLine(
  token: string,
  payload: ServiceChargeLineWritePayload,
): Promise<ServiceChargeLine> {
  return apiPost<ServiceChargeLine>("/api/customers/service-charge-lines/", payload, {
    token,
  });
}

export function updateServiceChargeLine(
  token: string,
  lineId: number,
  payload: ServiceChargeLineWritePayload,
): Promise<ServiceChargeLine> {
  return apiPatch<ServiceChargeLine>(
    `/api/customers/service-charge-lines/${lineId}/`,
    payload,
    {
      token,
    },
  );
}

export function deleteServiceChargeLine(token: string, lineId: number): Promise<null> {
  return apiDelete(`/api/customers/service-charge-lines/${lineId}/`, {
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
): Promise<ServiceTypeDetail[]> {
  const searchParams = new URLSearchParams({
    q: query,
    is_active: "true",
    page: "1",
    page_size: "100",
  });

  return apiGet<PaginatedResponse<ServiceTypeDetail>>(
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
): Promise<ServiceTypeDetail> {
  return apiPost<ServiceTypeDetail>("/api/customers/service-types/", payload, {
    token,
  });
}

// Pantalla de tipos de servicio (punto 1A del plan del 2026-10-22).
export function getServiceTypesPage(
  token: string,
  filters: ServiceTypeFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<ServiceTypeDetail>> {
  const searchParams = new URLSearchParams({
    page: String(filters.page),
    page_size: String(filters.pageSize),
  });

  if (filters.query.trim()) {
    searchParams.set("q", filters.query.trim());
  }

  if (filters.activeState !== "all") {
    searchParams.set("is_active", filters.activeState === "active" ? "true" : "false");
  }

  return apiGet<PaginatedResponse<ServiceTypeDetail>>(
    `/api/customers/service-types/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  );
}

export function getServiceType(
  token: string,
  serviceTypeId: number,
  signal?: AbortSignal,
): Promise<ServiceTypeDetail> {
  return apiGet<ServiceTypeDetail>(`/api/customers/service-types/${serviceTypeId}/`, {
    token,
    signal,
  });
}

export function updateServiceType(
  token: string,
  serviceTypeId: number,
  payload: ServiceTypeWritePayload,
): Promise<ServiceTypeDetail> {
  return apiPatch<ServiceTypeDetail>(
    `/api/customers/service-types/${serviceTypeId}/`,
    payload,
    {
      token,
    },
  );
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
