import { apiGet } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  StockMovement,
  StockMovementFilters,
} from "./types";

function buildStockMovementsQuery(
  filters: StockMovementFilters,
): string {
  const searchParams = new URLSearchParams();

  if (filters.productId !== undefined) {
    searchParams.set("product", String(filters.productId));
  }

  if (filters.locationId !== undefined) {
    searchParams.set("location", String(filters.locationId));
  }

  if (filters.movementType) {
    searchParams.set("movement_type", filters.movementType);
  }

  if (filters.direction) {
    searchParams.set("direction", filters.direction);
  }

  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }

  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }

  if (filters.purchaseId !== undefined) {
    searchParams.set("purchase", String(filters.purchaseId));
  }

  if (filters.saleId !== undefined) {
    searchParams.set("sale", String(filters.saleId));
  }

  if (filters.inventoryCountId !== undefined) {
    searchParams.set(
      "inventory_count",
      String(filters.inventoryCountId),
    );
  }

  searchParams.set("ordering", filters.ordering);
  searchParams.set("page", String(filters.page));
  searchParams.set("page_size", String(filters.pageSize));

  return searchParams.toString();
}

export function getStockMovements(
  token: string,
  filters: StockMovementFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<StockMovement>> {
  const query = buildStockMovementsQuery(filters);

  return apiGet<PaginatedResponse<StockMovement>>(
    `/api/inventory/stock-movements/?${query}`,
    {
      token,
      signal,
    },
  );
}

const KARDEX_PAGE_SIZE = 200;
const KARDEX_MAX_PAGES = 10;

export type StockMovementKardexResult = {
  movements: StockMovement[];
  truncated: boolean;
};

export async function getStockMovementsKardex(
  token: string,
  filters: Omit<StockMovementFilters, "page" | "pageSize" | "ordering">,
  signal?: AbortSignal,
): Promise<StockMovementKardexResult> {
  const movements: StockMovement[] = [];
  let page = 1;

  while (page <= KARDEX_MAX_PAGES) {
    const response = await getStockMovements(
      token,
      {
        ...filters,
        ordering: "created_at",
        page,
        pageSize: KARDEX_PAGE_SIZE,
      },
      signal,
    );

    movements.push(...response.results);

    const hasMore = response.next !== null && movements.length < response.count;

    if (!hasMore) {
      return { movements, truncated: false };
    }

    page += 1;
  }

  return { movements, truncated: true };
}
