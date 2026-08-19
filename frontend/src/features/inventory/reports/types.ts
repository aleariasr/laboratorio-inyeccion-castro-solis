import type { PaginatedResponse } from "@/lib/api/types";

export type StockByLocationProduct = {
  id: number;
  standard_code: string;
  name: string;
  current_stock: number;
  minimum_stock: number;
};

export type StockByLocationEntry = {
  id: number;
  code: string;
  description: string;
  total_stock: number;
  products: StockByLocationProduct[];
};

export type StockByLocationReport = {
  results: StockByLocationEntry[];
};

export type LowStockProduct = {
  id: number;
  standard_code: string;
  name: string;
  minimum_stock: number;
  current_stock: number;
  storage_location: {
    id: number;
    code: string;
  };
};

export type LowStockProductsReport = PaginatedResponse<LowStockProduct>;

export type LowStockProductsFilters = {
  page: number;
  pageSize: number;
};

export const EMPTY_LOW_STOCK_PRODUCTS_FILTERS: LowStockProductsFilters = {
  page: 1,
  pageSize: 50,
};

export type PurchasesBySupplierEntry = {
  supplier: {
    id: number;
    name: string;
  };
  purchase_count: number;
  invoice_subtotal: string;
  currency: "CRC";
};

export type PurchasesBySupplierReport = PaginatedResponse<PurchasesBySupplierEntry> & {
  date_from: string | null;
  date_to: string | null;
};

export type SalesByDateEntry = {
  date: string;
  sale_count: number;
  total: string;
};

export type SalesByDateReport = PaginatedResponse<SalesByDateEntry> & {
  date_from: string | null;
  date_to: string | null;
};

export type TopSellingProduct = {
  product: {
    id: number;
    standard_code: string;
    name: string;
  };
  quantity_sold: number;
  total: string;
};

export type TopSellingProductsReport = PaginatedResponse<TopSellingProduct> & {
  date_from: string | null;
  date_to: string | null;
};

export type ReportDateFilters = {
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
};

export const EMPTY_REPORT_DATE_FILTERS: ReportDateFilters = {
  dateFrom: "",
  dateTo: "",
  page: 1,
  pageSize: 50,
};

export type TopCustomer = {
  customer: {
    id: number;
    display_name: string;
  };
  sale_count: number;
  total: string;
};

export type TopCustomersOrdering = "total" | "sale_count";

export type TopCustomersReport = PaginatedResponse<TopCustomer> & {
  date_from: string | null;
  date_to: string | null;
  ordering: TopCustomersOrdering;
};

export type TopCustomersFilters = ReportDateFilters & {
  ordering: TopCustomersOrdering;
};

export const EMPTY_TOP_CUSTOMERS_FILTERS: TopCustomersFilters = {
  ...EMPTY_REPORT_DATE_FILTERS,
  ordering: "total",
};
