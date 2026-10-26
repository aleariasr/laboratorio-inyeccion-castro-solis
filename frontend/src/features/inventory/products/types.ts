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
  /** Punto 16: código propio, además del universal. "" si no tiene. */
  own_code: string;
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

/**
 * Punto 2 del plan del 2026-10-22: campos por los que se ordena la lista
 * de productos (el `?ordering=` del backend, PRODUCT_ORDERINGS).
 */
export type ProductOrderingField =
  | "standard_code"
  | "name"
  | "description"
  | "location"
  | "current_stock"
  | "created_at"
  | "updated_at";

export type ProductOrdering = {
  field: ProductOrderingField;
  direction: "asc" | "desc";
};

export const DEFAULT_PRODUCT_ORDERING: ProductOrdering = {
  field: "standard_code",
  direction: "asc",
};

type OrderingFieldKind = "text" | "number" | "date";

export const PRODUCT_ORDERING_FIELD_OPTIONS: Array<{
  value: ProductOrderingField;
  label: string;
  kind: OrderingFieldKind;
}> = [
  { value: "standard_code", label: "Código", kind: "text" },
  { value: "name", label: "Nombre", kind: "text" },
  { value: "description", label: "Descripción", kind: "text" },
  { value: "location", label: "Ubicación", kind: "text" },
  { value: "current_stock", label: "Existencia", kind: "number" },
  { value: "created_at", label: "Fecha de registro", kind: "date" },
  { value: "updated_at", label: "Fecha de modificación", kind: "date" },
];

const DIRECTION_LABELS: Record<OrderingFieldKind, Record<ProductOrdering["direction"], string>> = {
  text: { asc: "A → Z", desc: "Z → A" },
  number: { asc: "Menor a mayor", desc: "Mayor a menor" },
  date: { asc: "Más antiguos primero", desc: "Más recientes primero" },
};

/** Texto de cada dirección según el campo ("A → Z", "Mayor a menor"…). */
export function productOrderingDirectionLabel(
  field: ProductOrderingField,
  direction: ProductOrdering["direction"],
): string {
  const kind =
    PRODUCT_ORDERING_FIELD_OPTIONS.find((option) => option.value === field)?.kind ?? "text";

  return DIRECTION_LABELS[kind][direction];
}

export type ProductFilters = {
  query: string;
  activeState: "all" | "active" | "inactive";
  storageLocationId?: number;
  /** Sin valor, el orden por defecto del backend (el de los buscadores). */
  ordering?: ProductOrdering;
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
  own_code: string;
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
  ownCode: string;
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
  | "ownCode"
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
  ownCode: "",
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
    ownCode: product.own_code,
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
    own_code: values.ownCode.trim(),
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

// Crear variante: el código universal se hereda siempre del producto
// padre. La ubicación también, salvo que se elija otra (punto 16) — ver
// ProductViewSet.add_variant.
export type ProductVariantWritePayload = {
  own_code: string;
  storage_location?: number;
  name: string;
  description: string;
  variant_kind: VariantKind;
  unit_of_measure?: string;
  custom_sale_price: string | null;
};

export type ProductVariantFormValues = {
  ownCode: string;
  storageLocationId: string;
  name: string;
  description: string;
  variantKind: VariantKind;
  unitOfMeasure: string;
  customSalePrice: string;
};

export type ProductVariantFormField =
  | "ownCode"
  | "storageLocationId"
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
    ownCode: "",
    storageLocationId: String(parent.storage_location),
    name: "",
    description: "",
    variantKind: "GENERIC",
    unitOfMeasure: parent.unit_of_measure,
    customSalePrice: "",
  };
}

export function buildProductVariantWritePayload(
  values: ProductVariantFormValues,
  parent: Product,
): ProductVariantWritePayload {
  const trimmedCustomSalePrice = values.customSalePrice.trim();
  const trimmedUnitOfMeasure = values.unitOfMeasure.trim();
  const storageLocation = Number(values.storageLocationId);

  return {
    own_code: values.ownCode.trim(),
    // Solo si cambia: con la del padre, el backend la hereda (aunque esa
    // ubicación ya esté inactiva, como hasta ahora).
    ...(storageLocation && storageLocation !== parent.storage_location
      ? { storage_location: storageLocation }
      : {}),
    name: values.name.trim(),
    description: values.description.trim(),
    variant_kind: values.variantKind,
    ...(trimmedUnitOfMeasure ? { unit_of_measure: trimmedUnitOfMeasure } : {}),
    custom_sale_price: trimmedCustomSalePrice
      ? trimmedCustomSalePrice
      : null,
  };
}
