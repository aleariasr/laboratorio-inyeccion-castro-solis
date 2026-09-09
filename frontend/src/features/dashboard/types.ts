export type DashboardLowStockProduct = {
  id: number;
  standard_code: string;
  name: string;
  current_stock: number;
  minimum_stock: number;
};

export type DashboardServiceReady = {
  id: number;
  injector_number: string;
  customer_display_name: string;
};

export type DashboardDraftSale = {
  id: number;
  customer_display_name: string | null;
  sale_date: string;
};

export type DashboardDraftPurchase = {
  id: number;
  supplier_name: string;
  invoice_number: string;
  purchase_date: string;
};

export type DashboardSummary = {
  low_stock_products: DashboardLowStockProduct[] | null;
  services_ready: DashboardServiceReady[] | null;
  services_in_progress_count: number | null;
  draft_sales: DashboardDraftSale[] | null;
  draft_purchases: DashboardDraftPurchase[] | null;
  cash_pending_week_start: string | null;
};
