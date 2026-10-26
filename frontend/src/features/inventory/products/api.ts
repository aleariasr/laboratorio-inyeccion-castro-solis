import {
  apiGet,
  apiPatch,
  apiPost,
  apiPostBlob,
} from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";
import type { DiscountType } from "@/lib/document-amounts";

import type {
  Product,
  ProductFilters,
  ProductVariantWritePayload,
  ProductWritePayload,
  StockMovement,
} from "./types";

import { productOrderingParam } from "./ordering";

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

  if (
    filters.storageLocationId !== undefined
  ) {
    searchParams.set(
      "storage_location",
      String(filters.storageLocationId),
    );
  }

  if (filters.ordering) {
    searchParams.set(
      "ordering",
      productOrderingParam(filters.ordering),
    );
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

export async function getProductVariants(
  token: string,
  standardCode: string,
  currentProductId: number,
  signal?: AbortSignal,
): Promise<Product[]> {
  const siblings = await getAllPages<Product>(
    (page) => {
      const searchParams =
        new URLSearchParams({
          standard_code: standardCode,
          page: String(page),
          page_size: "100",
        });

      return `/api/inventory/products/?${searchParams.toString()}`;
    },
    token,
    signal,
  );

  return siblings.filter(
    (product) => product.id !== currentProductId,
  );
}

export function addProductVariant(
  token: string,
  productId: number,
  payload: ProductVariantWritePayload,
): Promise<Product> {
  return apiPost<Product>(
    `/api/inventory/products/${productId}/add-variant/`,
    payload,
    {
      token,
    },
  );
}

export function getProductStockMovements(
  token: string,
  productId: number,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<PaginatedResponse<StockMovement>> {
  const searchParams = new URLSearchParams({
    product: String(productId),
    page: String(page),
    page_size: String(pageSize),
  });

  return apiGet<
    PaginatedResponse<StockMovement>
  >(
    `/api/inventory/stock-movements/?${searchParams.toString()}`,
    {
      token,
      signal,
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

export function updateProductSalePrice(
  token: string,
  productId: number,
  customSalePrice: string | null,
): Promise<Product> {
  return apiPatch<Product>(
    `/api/inventory/products/${productId}/`,
    {
      custom_sale_price: customSalePrice,
    },
    {
      token,
    },
  );
}

export type ProductLabelItem = {
  productId: number;
  copies: number;
};

/**
 * Punto 4: las etiquetas salen en el orden de `items`, con las copias de
 * cada producto seguidas.
 */
export function generateProductLabels(
  token: string,
  items: ProductLabelItem[],
): Promise<Blob> {
  return apiPostBlob(
    "/api/inventory/products/labels/",
    {
      items: items.map((item) => ({
        product_id: item.productId,
        copies: item.copies,
      })),
    },
    {
      token,
      timeoutMs: 30_000,
    },
  );
}

export type ProformaItem = {
  productId: number;
  quantity: number;
};

export type ProformaAmountSettings = {
  discountType: DiscountType;
  discountValue: string;
  taxPercentage: string;
};

/** Si un producto se repite, el backend suma sus cantidades. */
export function createProforma(
  token: string,
  items: ProformaItem[],
  customerId: number | null,
  amountSettings: ProformaAmountSettings,
): Promise<Blob> {
  return apiPostBlob(
    "/api/documents/proforma/",
    {
      items: items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
      customer_id: customerId,
      // Punto 15: mismo descuento e impuesto que la venta.
      discount_type: amountSettings.discountType,
      discount_value: amountSettings.discountValue.trim() || "0",
      tax_percentage: amountSettings.taxPercentage.trim() || "0",
    },
    {
      token,
      timeoutMs: 30_000,
    },
  );
}
