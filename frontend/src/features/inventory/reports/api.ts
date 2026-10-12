import { apiGet, apiGetBlob } from "@/lib/api/client";

import type {
  LowStockProductsFilters,
  LowStockProductsReport,
  MostMovedProductsReport,
  ProductSupplierPricesFilters,
  ProductSupplierPricesReport,
  PurchasesBySupplierReport,
  ReportDateFilters,
  SalesSummaryFilters,
  SalesSummaryReport,
  StockByLocationFilters,
  StockByLocationReport,
  TopCustomersFilters,
  TopCustomersReport,
  TopSellingProductsReport,
} from "./types";

function buildStockByLocationQuery(filters: StockByLocationFilters): string {
  const searchParams = new URLSearchParams();

  if (filters.location !== null) {
    searchParams.set("location", String(filters.location));
  }

  if (filters.q) {
    searchParams.set("q", filters.q);
  }

  searchParams.set("page", String(filters.page));
  searchParams.set("page_size", String(filters.pageSize));

  return searchParams.toString();
}

export function getStockByLocationReport(
  token: string,
  filters: StockByLocationFilters,
  signal?: AbortSignal,
): Promise<StockByLocationReport> {
  const query = buildStockByLocationQuery(filters);

  return apiGet<StockByLocationReport>(
    `/api/reports/stock-by-location/?${query}`,
    {
      token,
      signal,
    },
  );
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

function buildSalesSummaryQuery(filters: SalesSummaryFilters): string {
  const searchParams = new URLSearchParams({
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    group_by: filters.groupBy,
  });

  if (filters.compareFrom && filters.compareTo) {
    searchParams.set("compare_from", filters.compareFrom);
    searchParams.set("compare_to", filters.compareTo);
  }

  return searchParams.toString();
}

export function getSalesSummaryReport(
  token: string,
  filters: SalesSummaryFilters,
  signal?: AbortSignal,
): Promise<SalesSummaryReport> {
  return apiGet<SalesSummaryReport>(
    `/api/reports/sales-summary/?${buildSalesSummaryQuery(filters)}`,
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

function buildTopCustomersQuery(filters: TopCustomersFilters): string {
  const searchParams = new URLSearchParams(buildReportDateQuery(filters));

  searchParams.set("ordering", filters.ordering);

  return searchParams.toString();
}

export function getTopCustomersReport(
  token: string,
  filters: TopCustomersFilters,
  signal?: AbortSignal,
): Promise<TopCustomersReport> {
  return apiGet<TopCustomersReport>(
    `/api/reports/top-customers/?${buildTopCustomersQuery(filters)}`,
    {
      token,
      signal,
    },
  );
}

export function getProductSupplierPricesReport(
  token: string,
  filters: ProductSupplierPricesFilters,
  signal?: AbortSignal,
): Promise<ProductSupplierPricesReport> {
  const searchParams = new URLSearchParams();

  searchParams.set("product", String(filters.productId));
  searchParams.set("page", String(filters.page));
  searchParams.set("page_size", String(filters.pageSize));

  return apiGet<ProductSupplierPricesReport>(
    `/api/reports/product-supplier-prices/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  );
}

export function getMostMovedProductsReport(
  token: string,
  filters: ReportDateFilters,
  signal?: AbortSignal,
): Promise<MostMovedProductsReport> {
  const query = buildReportDateQuery(filters);

  return apiGet<MostMovedProductsReport>(
    `/api/reports/most-moved-products/?${query}`,
    {
      token,
      signal,
    },
  );
}

// PDF de cada reporte (puntos 2 + 27): la ruta hermana .../pdf/ con los
// mismos filtros de la pantalla, sin paginar.

const REPORT_PDF_TIMEOUT_MS = 60_000;

function withoutPagination(query: string): string {
  const searchParams = new URLSearchParams(query);

  searchParams.delete("page");
  searchParams.delete("page_size");

  return searchParams.toString();
}

// Sirve igual para el PDF y para el Excel: los dos son un archivo.
function getReportPdf(token: string, path: string, query = ""): Promise<Blob> {
  return apiGetBlob(query ? `${path}?${query}` : path, {
    token,
    timeoutMs: REPORT_PDF_TIMEOUT_MS,
  });
}

export function getLowStockProductsReportPdf(token: string): Promise<Blob> {
  return getReportPdf(token, "/api/reports/low-stock-products/pdf/");
}

export function getStockByLocationReportPdf(
  token: string,
  filters: StockByLocationFilters,
): Promise<Blob> {
  return getReportPdf(
    token,
    "/api/reports/stock-by-location/pdf/",
    withoutPagination(buildStockByLocationQuery(filters)),
  );
}

export function getPurchasesBySupplierReportPdf(
  token: string,
  filters: ReportDateFilters,
): Promise<Blob> {
  return getReportPdf(
    token,
    "/api/reports/purchases-by-supplier/pdf/",
    withoutPagination(buildReportDateQuery(filters)),
  );
}

export function getProductSupplierPricesReportPdf(
  token: string,
  productId: number,
): Promise<Blob> {
  return getReportPdf(
    token,
    "/api/reports/product-supplier-prices/pdf/",
    new URLSearchParams({ product: String(productId) }).toString(),
  );
}

export function getSalesSummaryReportPdf(
  token: string,
  filters: SalesSummaryFilters,
): Promise<Blob> {
  return getReportPdf(
    token,
    "/api/reports/sales-summary/pdf/",
    buildSalesSummaryQuery(filters),
  );
}

export function getTopSellingProductsReportPdf(
  token: string,
  filters: ReportDateFilters,
): Promise<Blob> {
  return getReportPdf(
    token,
    "/api/reports/top-selling-products/pdf/",
    withoutPagination(buildReportDateQuery(filters)),
  );
}

export function getTopCustomersReportPdf(
  token: string,
  filters: TopCustomersFilters,
): Promise<Blob> {
  return getReportPdf(
    token,
    "/api/reports/top-customers/pdf/",
    withoutPagination(buildTopCustomersQuery(filters)),
  );
}

export function getMostMovedProductsReportPdf(
  token: string,
  filters: ReportDateFilters,
): Promise<Blob> {
  return getReportPdf(
    token,
    "/api/reports/most-moved-products/pdf/",
    withoutPagination(buildReportDateQuery(filters)),
  );
}

/** Excel del ranking (punto 28), con los mismos filtros. */
export function getMostMovedProductsReportExcel(
  token: string,
  filters: ReportDateFilters,
): Promise<Blob> {
  return getReportPdf(
    token,
    "/api/reports/most-moved-products/excel/",
    withoutPagination(buildReportDateQuery(filters)),
  );
}
