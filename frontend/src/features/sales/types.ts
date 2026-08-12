import type { Product } from "../inventory/products/types";
import type { ProductCostHistory } from "../inventory/purchases/types";

export type SaleStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";

export type Currency = "CRC" | "USD";

export type CustomerSummary = {
  id: number;
  customer_type: string;
  display_name: string;
  phone: string;
  email: string;
  identification: string;
  is_active: boolean;
};

export type SaleItemInline = {
  id: number;
  product: number;
  product_detail: {
    id: number;
    standard_code: string;
    name: string;
  };
  quantity: number;
  unit_price: string;
  subtotal: string;
};

export type Sale = {
  id: number;
  customer: number | null;
  customer_detail: CustomerSummary | null;
  sale_date: string;
  currency: Currency;
  exchange_rate: string;
  status: SaleStatus;
  confirmed_at: string | null;
  confirmed_by: number | null;
  cancelled_at: string | null;
  cancelled_by: number | null;
  cancellation_reason: string;
  notes: string;
  items: SaleItemInline[];
  total: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SaleFilters = {
  query: string;
  customerId?: number;
  status: "" | SaleStatus;
  dateFrom: string;
  dateTo: string;
  activeState: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export type SaleWritePayload = {
  customer: number | null;
  sale_date: string;
  notes: string;
  is_active: boolean;
};

export type SaleFormValues = {
  customerId: string;
  saleDate: string;
  notes: string;
  isActive: boolean;
};

export type SaleFormField =
  | "customerId"
  | "saleDate"
  | "notes"
  | "isActive";

export type SaleFormErrors = Partial<Record<SaleFormField, string>>;

export const EMPTY_SALE_FORM_VALUES: SaleFormValues = {
  customerId: "",
  saleDate: "",
  notes: "",
  isActive: true,
};

export function saleToFormValues(sale: Sale): SaleFormValues {
  return {
    customerId: sale.customer ? String(sale.customer) : "",
    saleDate: sale.sale_date,
    notes: sale.notes,
    isActive: sale.is_active,
  };
}

export function buildSaleWritePayload(
  values: SaleFormValues,
): SaleWritePayload {
  return {
    customer: values.customerId ? Number(values.customerId) : null,
    sale_date: values.saleDate,
    notes: values.notes.trim(),
    is_active: values.isActive,
  };
}

// Líneas de venta

export type SaleItemWritePayload = {
  sale: number;
  product: number;
  quantity: number;
  unit_price: string;
};

export type SaleItemFormValues = {
  productId: string;
  quantity: string;
  unitPrice: string;
};

export type SaleItemFormField = "productId" | "quantity" | "unitPrice";

export type SaleItemFormErrors = Partial<Record<SaleItemFormField, string>>;

export const EMPTY_SALE_ITEM_FORM_VALUES: SaleItemFormValues = {
  productId: "",
  quantity: "",
  unitPrice: "",
};

export function buildSaleItemWritePayload(
  saleId: number,
  values: SaleItemFormValues,
): SaleItemWritePayload {
  return {
    sale: saleId,
    product: Number(values.productId),
    quantity: Number(values.quantity),
    unit_price: values.unitPrice.trim(),
  };
}

// Reexportado para el combobox de producto y la referencia de precio
export type { Product, ProductCostHistory };
