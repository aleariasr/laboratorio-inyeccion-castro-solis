import type { Supplier, SupplierProduct } from "../suppliers/types";

export type PurchaseStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";

export type Currency = "CRC" | "USD";

export type PurchaseItemInline = {
  id: number;
  supplier_product: number;
  supplier_product_detail: {
    id: number;
    supplier_reference: string;
    manufacturer: string;
    product: {
      id: number;
      standard_code: string;
      name: string;
    };
  };
  quantity: number;
  unit_cost: string;
  subtotal: string;
};

export type Purchase = {
  id: number;
  supplier: number;
  supplier_detail: Supplier;
  invoice_number: string;
  purchase_date: string;
  currency: Currency;
  exchange_rate: string;
  status: PurchaseStatus;
  confirmed_at: string | null;
  confirmed_by: number | null;
  cancelled_at: string | null;
  cancelled_by: number | null;
  cancellation_reason: string;
  notes: string;
  items: PurchaseItemInline[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PurchaseFilters = {
  query: string;
  status: "" | PurchaseStatus;
  currency: "" | Currency;
  dateFrom: string;
  dateTo: string;
  activeState: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export type PurchaseWritePayload = {
  supplier: number;
  invoice_number: string;
  purchase_date: string;
  currency: Currency;
  exchange_rate: string;
  notes: string;
  is_active: boolean;
};

export type PurchaseFormValues = {
  supplierId: string;
  invoiceNumber: string;
  purchaseDate: string;
  currency: Currency;
  exchangeRate: string;
  notes: string;
  isActive: boolean;
};

export type PurchaseFormField =
  | "supplierId"
  | "invoiceNumber"
  | "purchaseDate"
  | "currency"
  | "exchangeRate"
  | "notes"
  | "isActive";

export type PurchaseFormErrors = Partial<Record<PurchaseFormField, string>>;

export const EMPTY_PURCHASE_FORM_VALUES: PurchaseFormValues = {
  supplierId: "",
  invoiceNumber: "",
  purchaseDate: "",
  currency: "CRC",
  exchangeRate: "1",
  notes: "",
  isActive: true,
};

export function purchaseToFormValues(
  purchase: Purchase,
): PurchaseFormValues {
  return {
    supplierId: String(purchase.supplier),
    invoiceNumber: purchase.invoice_number,
    purchaseDate: purchase.purchase_date,
    currency: purchase.currency,
    exchangeRate: purchase.exchange_rate,
    notes: purchase.notes,
    isActive: purchase.is_active,
  };
}

export function buildPurchaseWritePayload(
  values: PurchaseFormValues,
): PurchaseWritePayload {
  return {
    supplier: Number(values.supplierId),
    invoice_number: values.invoiceNumber.trim(),
    purchase_date: values.purchaseDate,
    currency: values.currency,
    exchange_rate: values.exchangeRate.trim(),
    notes: values.notes.trim(),
    is_active: values.isActive,
  };
}

// Líneas de compra (Paso 3.3)

export type PurchaseItemWritePayload = {
  purchase: number;
  supplier_product: number;
  quantity: number;
  unit_cost: string;
};

export type PurchaseItemFormValues = {
  supplierProductId: string;
  quantity: string;
  unitCost: string;
};

export type PurchaseItemFormField =
  | "supplierProductId"
  | "quantity"
  | "unitCost";

export type PurchaseItemFormErrors = Partial<Record<PurchaseItemFormField, string>>;

export const EMPTY_PURCHASE_ITEM_FORM_VALUES: PurchaseItemFormValues = {
  supplierProductId: "",
  quantity: "",
  unitCost: "",
};

export function buildPurchaseItemWritePayload(
  purchaseId: number,
  values: PurchaseItemFormValues,
): PurchaseItemWritePayload {
  return {
    purchase: purchaseId,
    supplier_product: Number(values.supplierProductId),
    quantity: Number(values.quantity),
    unit_cost: values.unitCost.trim(),
  };
}

// Reexportado para el combobox de proveedor y de producto-proveedor
export type { Supplier, SupplierProduct };
