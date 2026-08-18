import { apiGet } from "@/lib/api/client";

import type {
  LowStockProductsFilters,
  LowStockProductsReport,
  PurchasesBySupplierReport,
  ReportDateFilters,
  SalesByDateReport,
  StockByLocationReport,
  TopSellingProductsReport,
} from "./types";

export function getStockByLocationReport(
  token: string,
  signal?: AbortSignal,
): Promise<StockByLocationReport> {
  return apiGet<StockByLocationReport>("/api/reports/stock-by-location/", {
    token,
    signal,
  });
}

export function getLowStockProductsReport(
  token: string,
  filters: LowStockProductsFilters,
  signal?: AbortSignal,
): Promise<LowStockProductsReport> {
  const searchParams = new URLSearchParams();

  searchParams.set("page", String(filters.page));
  searchParams.set("page_size", String(filters.pageSize));

  return apiGet<LowStockProductsReport>(
    `/api/reports/low-stock-products/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  );
}

function buildReportDateQuery(filters: ReportDateFilters): string {
  const searchParams = new URLSearchParams();

  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }

  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }

  searchParams.set("page", String(filters.page));
  searchParams.set("page_size", String(filters.pageSize));

  return searchParams.toString();
}

export function getPurchasesBySupplierReport(
  token: string,
  filters: ReportDateFilters,
  signal?: AbortSignal,
): Promise<PurchasesBySupplierReport> {
  const query = buildReportDateQuery(filters);

  return apiGet<PurchasesBySupplierReport>(
    `/api/reports/purchases-by-supplier/?${query}`,
    {
      token,
      signal,
    },
  );
}

export function getSalesByDateReport(
  token: string,
  filters: ReportDateFilters,
  signal?: AbortSignal,
): Promise<SalesByDateReport> {
  const query = buildReportDateQuery(filters);

  return apiGet<SalesByDateReport>(
    `/api/reports/sales-by-date/?${query}`,
    {
      token,
      signal,
    },
  );
}

export function getTopSellingProductsReport(
  token: string,
  filters: ReportDateFilters,
  signal?: AbortSignal,
): Promise<TopSellingProductsReport> {
  const query = buildReportDateQuery(filters);

  return apiGet<TopSellingProductsReport>(
    `/api/reports/top-selling-products/?${query}`,
    {
      token,
      signal,
    },
  );
}
