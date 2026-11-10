import type { Supplier, SupplierProduct } from "../suppliers/types";

export type PurchaseStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";

export type Currency = "CRC" | "USD";

export type PurchaseItemInline = {
  id: number;
  supplier_product: number;
  supplier_product_detail: {
    id: number;
    manufacturer: string;
    product: {
      id: number;
      standard_code: string;
      name: string;
    };
  };
  quantity: number;
  unit_cost: string;
  /** Opcional: distingue líneas del mismo producto (p. ej. "Bodega Heredia"). */
  reference: string;
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
  /** Si ya se aplicaron costos (hay cálculo de costos guardado). */
  has_cost_calculation: boolean;
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
  product: number;
  quantity: number;
  unit_cost: string;
  reference: string;
};

export type PurchaseItemFormValues = {
  productId: string;
  quantity: string;
  unitCost: string;
  reference: string;
};

export type PurchaseItemFormField =
  | "productId"
  | "quantity"
  | "unitCost"
  | "reference";

export type PurchaseItemFormErrors = Partial<Record<PurchaseItemFormField, string>>;

export const EMPTY_PURCHASE_ITEM_FORM_VALUES: PurchaseItemFormValues = {
  productId: "",
  quantity: "",
  unitCost: "",
  reference: "",
};

export function buildPurchaseItemWritePayload(
  purchaseId: number,
  values: PurchaseItemFormValues,
): PurchaseItemWritePayload {
  return {
    purchase: purchaseId,
    product: Number(values.productId),
    quantity: Number(values.quantity),
    unit_cost: values.unitCost.trim(),
    reference: values.reference.trim(),
  };
}

// Reexportado para el combobox de proveedor y de producto-proveedor
export type { Supplier, SupplierProduct };

// Costos de importación (Paso 4)

export type ImportCostCategory = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ImportCostCategoryWritePayload = {
  name: string;
  description: string;
};

export type ImportCost = {
  id: number;
  purchase: number;
  purchase_detail: {
    id: number;
    invoice_number: string;
    supplier: string;
    currency: Currency;
    status: PurchaseStatus;
  };
  category: number;
  category_detail: ImportCostCategory;
  description: string;
  amount: string;
  currency: Currency;
  exchange_rate: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ImportCostWritePayload = {
  purchase: number;
  category: number;
  description: string;
  amount: string;
  currency: Currency;
  exchange_rate: string;
};

export type ImportCostFormValues = {
  categoryId: string;
  description: string;
  amount: string;
  currency: Currency;
  exchangeRate: string;
  isActive: boolean;
};

export type ImportCostFormField =
  | "categoryId"
  | "description"
  | "amount"
  | "currency"
  | "exchangeRate"
  | "isActive";

export type ImportCostFormErrors = Partial<Record<ImportCostFormField, string>>;

/**
 * Un costo nuevo arranca en la moneda de la compra. En dólares propone el
 * tipo de cambio de la compra (₡ por US$1); en colones, 1.
 */
export function emptyImportCostFormValues(
  currency: Currency,
  purchaseExchangeRate: string,
): ImportCostFormValues {
  return {
    categoryId: "",
    description: "",
    amount: "",
    currency,
    exchangeRate: currency === "USD" ? purchaseExchangeRate : "1",
    isActive: true,
  };
}

export function importCostToFormValues(importCost: ImportCost): ImportCostFormValues {
  return {
    categoryId: String(importCost.category),
    description: importCost.description,
    amount: importCost.amount,
    currency: importCost.currency,
    exchangeRate: importCost.exchange_rate,
    isActive: importCost.is_active,
  };
}

export function buildImportCostWritePayload(
  purchaseId: number,
  values: ImportCostFormValues,
): ImportCostWritePayload {
  return {
    purchase: purchaseId,
    category: Number(values.categoryId),
    description: values.description.trim(),
    amount: values.amount.trim(),
    currency: values.currency,
    exchange_rate: values.exchangeRate.trim(),
  };
}

/**
 * Resumen de costos (auditoría de compras en dólares, 2026-11-07): todo en
 * colones salvo los campos *_original / original_unit_cost, que están en
 * la moneda de la compra.
 */
/** Una línea de la compra en el resumen. */
export type CostSummaryItem = {
  /** Id de la línea (un producto puede venir en varias líneas). */
  id: number;
  supplier_product: number;
  product: number;
  standard_code: string;
  name: string;
  reference: string;
  quantity: number;
  /** En la moneda de la compra. */
  original_unit_cost: string;
  original_unit_cost_crc: string;
  /** Costo final de esta línea. */
  final_unit_cost: string;
  /** Precio del producto (promedio de sus líneas si viene en varias). */
  suggested_price: string;
  /** El producto viene en más de una línea de la compra. */
  is_repeated: boolean;
};

/** Un producto de la compra en el resumen (sus líneas sumadas). */
export type CostSummaryProduct = {
  product: number;
  standard_code: string;
  name: string;
  quantity: number;
  line_count: number;
  /** Costo unitario promedio ponderado, en la moneda de la compra. */
  original_unit_cost: string;
  final_unit_cost: string;
  suggested_price: string;
};

export type CostSummaryImportCost = {
  id: number;
  category: string;
  description: string;
  amount: string;
  currency: Currency;
  exchange_rate: string;
  amount_crc: string;
};

export type CostSummary = {
  purchase: number;
  currency: Currency;
  /** Con que se pasaron las líneas a colones (1 en una compra en colones). */
  exchange_rate: string;
  /** Subtotal de líneas en la moneda de la compra. */
  invoice_subtotal_original: string;
  invoice_subtotal: string;
  import_costs_total: string;
  total_cost: string;
  cost_factor: string;
  margin_percentage: string;
  suggested_total: string;
  import_costs: CostSummaryImportCost[];
  items: CostSummaryItem[];
  products: CostSummaryProduct[];
};

export type ProductCostHistory = {
  id: number;
  product: number;
  product_detail: {
    id: number;
    standard_code: string;
    name: string;
  };
  purchase: number;
  purchase_detail: {
    id: number;
    invoice_number: string;
    supplier: string;
    currency: Currency;
  };
  /** En la moneda de la compra (currency, exchange_rate). */
  original_unit_cost: string;
  cost_factor: string;
  /** En colones. */
  final_unit_cost: string;
  currency: Currency;
  exchange_rate: string;
  margin_percentage: string;
  /** En colones. */
  suggested_price: string | null;
  calculated_at: string;
  created_at: string;
  updated_at: string;
};
