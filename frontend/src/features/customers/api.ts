import { apiGet, apiPatch, apiPost } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  Customer,
  CustomerFilters,
  CustomerWritePayload,
} from "./types";

function buildCustomersQuery(filters: CustomerFilters): string {
  const searchParams = new URLSearchParams();

  const normalizedQuery = filters.query.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
  }

  if (filters.customerType) {
    searchParams.set("customer_type", filters.customerType);
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

export function getCustomers(
  token: string,
  filters: CustomerFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Customer>> {
  const query = buildCustomersQuery(filters);

  return apiGet<PaginatedResponse<Customer>>(
    `/api/customers/customers/?${query}`,
    {
      token,
      signal,
    },
  );
}

export function getCustomer(
  token: string,
  customerId: number,
  signal?: AbortSignal,
): Promise<Customer> {
  return apiGet<Customer>(`/api/customers/customers/${customerId}/`, {
    token,
    signal,
  });
}

export function createCustomer(
  token: string,
  payload: CustomerWritePayload,
): Promise<Customer> {
  return apiPost<Customer>("/api/customers/customers/", payload, {
    token,
  });
}

export function updateCustomer(
  token: string,
  customerId: number,
  payload: CustomerWritePayload,
): Promise<Customer> {
  return apiPatch<Customer>(`/api/customers/customers/${customerId}/`, payload, {
    token,
  });
}
