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

export type StockByLocationReport = PaginatedResponse<StockByLocationEntry> & {
  location: number | null;
  q: string | null;
};

export type StockByLocationFilters = {
  location: number | null;
  q: string;
  page: number;
  pageSize: number;
};

export const EMPTY_STOCK_BY_LOCATION_FILTERS: StockByLocationFilters = {
  location: null,
  q: "",
  page: 1,
  pageSize: 50,
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

// Resumen de ventas (punto 20). Mismo criterio que el cierre de caja.
export type SalesSummaryGroupBy = "day" | "week" | "month";

export type SalesSummaryBlock = {
  count: number;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  // total − tax: lo que es del negocio.
  business_income: string;
  by_method: Record<"CASH" | "CARD" | "TRANSFER" | "OTHER", string>;
};

export type SalesSummaryGroup = {
  sales: SalesSummaryBlock;
  services: SalesSummaryBlock;
  total: SalesSummaryBlock;
};

export type SalesSummaryPeriod = SalesSummaryGroup & {
  period_start: string;
  period_end: string;
};

export type SalesSummaryComparedField =
  | "count"
  | "subtotal"
  | "discount"
  | "tax"
  | "total"
  | "business_income";

export type SalesSummaryVariation = {
  amount: string;
  // null si el período comparado está en 0 (crecer desde 0 no es un %).
  percentage: string | null;
};

export type SalesSummaryReport = {
  date_from: string;
  date_to: string;
  group_by: SalesSummaryGroupBy;
  periods: SalesSummaryPeriod[];
  summary: SalesSummaryGroup;
  comparison: {
    date_from: string;
    date_to: string;
    summary: SalesSummaryGroup;
    variation: Record<
      keyof SalesSummaryGroup,
      Record<SalesSummaryComparedField, SalesSummaryVariation>
    >;
  } | null;
};

export type SalesSummaryFilters = {
  dateFrom: string;
  dateTo: string;
  groupBy: SalesSummaryGroupBy;
  compareFrom: string;
  compareTo: string;
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

export type MostMovedProduct = {
  product: {
    id: number;
    standard_code: string;
    name: string;
  };
  location_code: string;
  quantity_in: number;
  quantity_out: number;
  total_moved: number;
  movement_count: number;
};

export type MostMovedProductsReport = PaginatedResponse<MostMovedProduct> & {
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

export type ProductSupplierPriceHistoryEntry = {
  id: number;
  invoice_number: string;
  purchase_date: string;
  unit_cost: string;
  currency: "CRC";
};

export type ProductSupplierPriceEntry = {
  supplier: {
    id: number;
    name: string;
  };
  purchase_count: number;
  last_purchase_date: string;
  last_unit_cost: string;
  average_unit_cost: string;
  currency: "CRC";
  purchases: ProductSupplierPriceHistoryEntry[];
};

export type ProductSupplierPricesReport = PaginatedResponse<ProductSupplierPriceEntry> & {
  product: {
    id: number;
    standard_code: string;
    name: string;
  };
};

export type ProductSupplierPricesFilters = {
  productId: number;
  page: number;
  pageSize: number;
};
