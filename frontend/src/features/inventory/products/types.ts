import type { StorageLocationSummary } from "../locations/types";

export type { StorageLocationSummary } from "../locations/types";

export type Product = {
  id: number;
  standard_code: string;
  name: string;
  description: string;
  storage_location: number;
  storage_location_detail: StorageLocationSummary;
  minimum_stock: number;
  unit_of_measure: string;
  current_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductFilters = {
  query: string;
  activeState: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
};

export type ProductReference = {
  id: number;
  product: number;
  product_detail: {
    id: number;
    standard_code: string;
    name: string;
    description: string;
  };
  manufacturer: string;
  reference_code: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductWritePayload = {
  standard_code: string;
  name: string;
  description: string;
  storage_location: number;
  minimum_stock: number;
  unit_of_measure: string;
  is_active: boolean;
};

export type ProductFormValues = {
  standardCode: string;
  name: string;
  description: string;
  storageLocationId: string;
  minimumStock: string;
  unitOfMeasure: string;
  isActive: boolean;
};

export type ProductFormField =
  | "standardCode"
  | "name"
  | "description"
  | "storageLocationId"
  | "minimumStock"
  | "unitOfMeasure"
  | "isActive";

export type ProductFormErrors =
  Partial<Record<ProductFormField, string>>;

export const EMPTY_PRODUCT_FORM_VALUES: ProductFormValues = {
  standardCode: "",
  name: "",
  description: "",
  storageLocationId: "",
  minimumStock: "0",
  unitOfMeasure: "unidad",
  isActive: true,
};

export function productToFormValues(
  product: Product,
): ProductFormValues {
  return {
    standardCode: product.standard_code,
    name: product.name,
    description: product.description,
    storageLocationId: String(
      product.storage_location,
    ),
    minimumStock: String(
      product.minimum_stock,
    ),
    unitOfMeasure: product.unit_of_measure,
    isActive: product.is_active,
  };
}

export function buildProductWritePayload(
  values: ProductFormValues,
): ProductWritePayload {
  return {
    standard_code: values.standardCode.trim(),
    name: values.name.trim(),
    description: values.description.trim(),
    storage_location: Number(
      values.storageLocationId,
    ),
    minimum_stock: Number(
      values.minimumStock,
    ),
    unit_of_measure: values.unitOfMeasure.trim(),
    is_active: values.isActive,
  };
}
