import { apiGet } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  Product,
  ProductFilters,
  ProductReference,
} from "./types";

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
): Promise<PaginatedResponse<ProductReference>> {
  const searchParams = new URLSearchParams({
    product: String(productId),
    page_size: "100",
  });

  return apiGet<PaginatedResponse<ProductReference>>(
    `/api/inventory/product-references/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  );
}
