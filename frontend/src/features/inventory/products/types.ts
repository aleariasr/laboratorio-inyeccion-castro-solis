import type { StorageLocationSummary } from "../locations/types";

export type { StorageLocationSummary } from "../locations/types";

export type VariantKind = "ORIGINAL" | "GENERIC" | "OTHER";

export const VARIANT_KIND_LABELS: Record<VariantKind, string> = {
  ORIGINAL: "Original",
  GENERIC: "Genérico",
  OTHER: "Otro",
};

export const VARIANT_KIND_OPTIONS: Array<{ value: VariantKind; label: string }> = [
  { value: "ORIGINAL", label: "Original" },
  { value: "GENERIC", label: "Genérico" },
  { value: "OTHER", label: "Otro" },
];

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
  custom_sale_price: string | null;
  latest_suggested_price: string | null;
  effective_sale_price: string | null;
  variant_kind: VariantKind;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductFilters = {
  query: string;
  activeState: "all" | "active" | "inactive";
  storageLocationId?: number;
  page: number;
  pageSize: number;
};

export type StockMovementProductSummary = {
  id: number;
  standard_code: string;
  name: string;
};

export type { StockMovement } from "../movements/types";

export type ProductWritePayload = {
  standard_code: string;
  name: string;
  description: string;
  storage_location: number;
  minimum_stock: number;
  unit_of_measure: string;
  custom_sale_price: string | null;
  variant_kind: VariantKind;
  is_active: boolean;
};

export type ProductFormValues = {
  standardCode: string;
  name: string;
  description: string;
  storageLocationId: string;
  minimumStock: string;
  unitOfMeasure: string;
  customSalePrice: string;
  variantKind: VariantKind;
  isActive: boolean;
};

export type ProductFormField =
  | "standardCode"
  | "name"
  | "description"
  | "storageLocationId"
  | "minimumStock"
  | "unitOfMeasure"
  | "customSalePrice"
  | "variantKind"
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
  customSalePrice: "",
  variantKind: "ORIGINAL",
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
    customSalePrice: product.custom_sale_price ?? "",
    variantKind: product.variant_kind,
    isActive: product.is_active,
  };
}

export function buildProductWritePayload(
  values: ProductFormValues,
): ProductWritePayload {
  const trimmedCustomSalePrice = values.customSalePrice.trim();

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
    custom_sale_price: trimmedCustomSalePrice
      ? trimmedCustomSalePrice
      : null,
    variant_kind: values.variantKind,
    is_active: values.isActive,
  };
}

// Crear variante: código y ubicación se heredan del producto padre,
// no son campos de este formulario — ver ProductViewSet.add_variant.
export type ProductVariantWritePayload = {
  name: string;
  description: string;
  variant_kind: VariantKind;
  unit_of_measure?: string;
  custom_sale_price: string | null;
};

export type ProductVariantFormValues = {
  name: string;
  description: string;
  variantKind: VariantKind;
  unitOfMeasure: string;
  customSalePrice: string;
};

export type ProductVariantFormField =
  | "name"
  | "description"
  | "variantKind"
  | "unitOfMeasure"
  | "customSalePrice";

export type ProductVariantFormErrors =
  Partial<Record<ProductVariantFormField, string>>;

export function emptyProductVariantFormValues(
  parent: Product,
): ProductVariantFormValues {
  return {
    name: "",
    description: "",
    variantKind: "GENERIC",
    unitOfMeasure: parent.unit_of_measure,
    customSalePrice: "",
  };
}

export function buildProductVariantWritePayload(
  values: ProductVariantFormValues,
): ProductVariantWritePayload {
  const trimmedCustomSalePrice = values.customSalePrice.trim();
  const trimmedUnitOfMeasure = values.unitOfMeasure.trim();

  return {
    name: values.name.trim(),
    description: values.description.trim(),
    variant_kind: values.variantKind,
    ...(trimmedUnitOfMeasure ? { unit_of_measure: trimmedUnitOfMeasure } : {}),
    custom_sale_price: trimmedCustomSalePrice
      ? trimmedCustomSalePrice
      : null,
  };
}
