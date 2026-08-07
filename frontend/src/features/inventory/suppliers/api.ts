import {
  apiGet,
  apiPatch,
  apiPost,
} from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type { Product } from "../products/types";

import type {
  Supplier,
  SupplierFilters,
  SupplierProduct,
  SupplierProductWritePayload,
  SupplierWritePayload,
} from "./types";

function buildSuppliersQuery(
  filters: SupplierFilters,
): string {
  const searchParams = new URLSearchParams();

  const normalizedQuery = filters.query.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
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

async function getAllPages<T>(
  buildPath: (page: number) => string,
  token: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const response =
      await apiGet<PaginatedResponse<T>>(
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

export function getSuppliers(
  token: string,
  filters: SupplierFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Supplier>> {
  const query = buildSuppliersQuery(filters);

  return apiGet<PaginatedResponse<Supplier>>(
    `/api/inventory/suppliers/?${query}`,
    {
      token,
      signal,
    },
  );
}

export function getSupplier(
  token: string,
  supplierId: number,
  signal?: AbortSignal,
): Promise<Supplier> {
  return apiGet<Supplier>(
    `/api/inventory/suppliers/${supplierId}/`,
    {
      token,
      signal,
    },
  );
}

export function createSupplier(
  token: string,
  payload: SupplierWritePayload,
): Promise<Supplier> {
  return apiPost<Supplier>(
    "/api/inventory/suppliers/",
    payload,
    {
      token,
    },
  );
}

export function updateSupplier(
  token: string,
  supplierId: number,
  payload: SupplierWritePayload,
): Promise<Supplier> {
  return apiPatch<Supplier>(
    `/api/inventory/suppliers/${supplierId}/`,
    payload,
    {
      token,
    },
  );
}

export function getSupplierProducts(
  token: string,
  supplierId: number,
  signal?: AbortSignal,
): Promise<SupplierProduct[]> {
  return getAllPages<SupplierProduct>(
    (page) => {
      const searchParams =
        new URLSearchParams({
          supplier: String(supplierId),
          page: String(page),
          page_size: "100",
        });

      return `/api/inventory/supplier-products/?${searchParams.toString()}`;
    },
    token,
    signal,
  );
}

export function createSupplierProduct(
  token: string,
  payload: SupplierProductWritePayload,
): Promise<SupplierProduct> {
  return apiPost<SupplierProduct>(
    "/api/inventory/supplier-products/",
    payload,
    {
      token,
    },
  );
}

export function updateSupplierProduct(
  token: string,
  supplierProductId: number,
  payload: SupplierProductWritePayload,
): Promise<SupplierProduct> {
  return apiPatch<SupplierProduct>(
    `/api/inventory/supplier-products/${supplierProductId}/`,
    payload,
    {
      token,
    },
  );
}

export function updateSupplierProductState(
  token: string,
  supplierProductId: number,
  isActive: boolean,
): Promise<SupplierProduct> {
  return apiPatch<SupplierProduct>(
    `/api/inventory/supplier-products/${supplierProductId}/`,
    {
      is_active: isActive,
    },
    {
      token,
    },
  );
}

// Paso 4: búsqueda de productos para el combobox del formulario
// de producto asociado. Reutiliza el mismo endpoint y parámetro
// "q" que ya usa /inventory/products.
export function searchActiveProducts(
  token: string,
  query: string,
  signal?: AbortSignal,
): Promise<Product[]> {
  const searchParams = new URLSearchParams({
    q: query,
    is_active: "true",
    page: "1",
    page_size: "20",
  });

  return apiGet<PaginatedResponse<Product>>(
    `/api/inventory/products/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  ).then((response) => response.results);
}
