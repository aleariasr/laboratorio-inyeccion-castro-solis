import type { Product } from "../products/types";

export type InventoryCountStatus = "DRAFT" | "APPROVED" | "CANCELLED";

export type InventoryCount = {
  id: number;
  reference: string;
  count_date: string;
  status: InventoryCountStatus;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InventoryCountFilters = {
  query: string;
  status: "" | InventoryCountStatus;
  dateFrom: string;
  dateTo: string;
  activeState: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export type InventoryCountWritePayload = {
  reference: string;
  count_date: string;
  notes: string;
  is_active: boolean;
};

export type InventoryCountFormValues = {
  reference: string;
  countDate: string;
  notes: string;
  isActive: boolean;
};

export type InventoryCountFormField =
  | "reference"
  | "countDate"
  | "notes"
  | "isActive";

export type InventoryCountFormErrors = Partial<Record<InventoryCountFormField, string>>;

export const EMPTY_INVENTORY_COUNT_FORM_VALUES: InventoryCountFormValues = {
  reference: "",
  countDate: "",
  notes: "",
  isActive: true,
};

export function inventoryCountToFormValues(
  inventoryCount: InventoryCount,
): InventoryCountFormValues {
  return {
    reference: inventoryCount.reference,
    countDate: inventoryCount.count_date,
    notes: inventoryCount.notes,
    isActive: inventoryCount.is_active,
  };
}

export function buildInventoryCountWritePayload(
  values: InventoryCountFormValues,
): InventoryCountWritePayload {
  return {
    reference: values.reference.trim(),
    count_date: values.countDate,
    notes: values.notes.trim(),
    is_active: values.isActive,
  };
}

// Líneas de conteo (Paso 3)

export type InventoryCountItem = {
  id: number;
  inventory_count: number;
  product: number;
  product_detail: Product;
  counted_quantity: number;
  created_at: string;
  updated_at: string;
};

export type InventoryCountItemWritePayload = {
  inventory_count: number;
  product: number;
  counted_quantity: number;
};

export type InventoryCountItemFormValues = {
  productId: string;
  countedQuantity: string;
};

export type InventoryCountItemFormField = "productId" | "countedQuantity";

export type InventoryCountItemFormErrors = Partial<Record<InventoryCountItemFormField, string>>;

export const EMPTY_INVENTORY_COUNT_ITEM_FORM_VALUES: InventoryCountItemFormValues = {
  productId: "",
  countedQuantity: "",
};

export function buildInventoryCountItemWritePayload(
  inventoryCountId: number,
  values: InventoryCountItemFormValues,
): InventoryCountItemWritePayload {
  return {
    inventory_count: inventoryCountId,
    product: Number(values.productId),
    counted_quantity: Number(values.countedQuantity),
  };
}

// Reexportado para el combobox de producto
export type { Product };
