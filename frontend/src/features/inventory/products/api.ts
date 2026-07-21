import {
  apiGet,
  apiPatch,
  apiPost,
} from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  Product,
  ProductFilters,
  ProductReference,
  ProductReferenceWritePayload,
  ProductWritePayload,
} from "./types";

import type { StorageLocationSummary } from "../locations/types";

function buildProductsQuery(
  filters: ProductFilters,
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

export function getProducts(
  token: string,
  filters: ProductFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Product>> {
  const query = buildProductsQuery(filters);

  return apiGet<PaginatedResponse<Product>>(
    `/api/inventory/products/?${query}`,
    {
      token,
      signal,
    },
  );
}

export function getProduct(
  token: string,
  productId: number,
  signal?: AbortSignal,
): Promise<Product> {
  return apiGet<Product>(
    `/api/inventory/products/${productId}/`,
    {
      token,
      signal,
    },
  );
}

export function getProductReferences(
  token: string,
  productId: number,
  signal?: AbortSignal,
): Promise<ProductReference[]> {
  return getAllPages<ProductReference>(
    (page) => {
      const searchParams =
        new URLSearchParams({
          product: String(productId),
          page: String(page),
          page_size: "100",
        });

      return `/api/inventory/product-references/?${searchParams.toString()}`;
    },
    token,
    signal,
  );
}

export function createProductReference(
  token: string,
  payload: ProductReferenceWritePayload,
): Promise<ProductReference> {
  return apiPost<ProductReference>(
    "/api/inventory/product-references/",
    payload,
    {
      token,
    },
  );
}

export function updateProductReference(
  token: string,
  referenceId: number,
  payload: ProductReferenceWritePayload,
): Promise<ProductReference> {
  return apiPatch<ProductReference>(
    `/api/inventory/product-references/${referenceId}/`,
    payload,
    {
      token,
    },
  );
}

export function updateProductReferenceState(
  token: string,
  referenceId: number,
  isActive: boolean,
): Promise<ProductReference> {
  return apiPatch<ProductReference>(
    `/api/inventory/product-references/${referenceId}/`,
    {
      is_active: isActive,
    },
    {
      token,
    },
  );
}

export function getActiveLocations(
  token: string,
  signal?: AbortSignal,
): Promise<StorageLocationSummary[]> {
  return getAllPages<StorageLocationSummary>(
    (page) => {
      const searchParams =
        new URLSearchParams({
          is_active: "true",
          page: String(page),
          page_size: "100",
        });

      return `/api/inventory/locations/?${searchParams.toString()}`;
    },
    token,
    signal,
  );
}

export function createProduct(
  token: string,
  payload: ProductWritePayload,
): Promise<Product> {
  return apiPost<Product>(
    "/api/inventory/products/",
    payload,
    {
      token,
    },
  );
}

export function updateProduct(
  token: string,
  productId: number,
  payload: ProductWritePayload,
): Promise<Product> {
  return apiPatch<Product>(
    `/api/inventory/products/${productId}/`,
    payload,
    {
      token,
    },
  );
}