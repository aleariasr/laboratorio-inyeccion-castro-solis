import {
  DEFAULT_PRODUCT_ORDERING,
  PRODUCT_ORDERING_FIELD_OPTIONS,
  type Product,
  type ProductOrdering,
} from "./types";

const STORAGE_KEY = "lics.products.ordering";

/** `?ordering=` del backend: el campo, con "-" delante si es descendente. */
export function productOrderingParam(ordering: ProductOrdering): string {
  return ordering.direction === "desc" ? `-${ordering.field}` : ordering.field;
}

/**
 * Mismo criterio que la colación `lics_natural` del backend (ICU, español,
 * números como números: "A2" antes que "A10"), para que la ventana de
 * etiquetas muestre exactamente el orden en que salen.
 */
const naturalCollator = new Intl.Collator("es", { numeric: true });

function compareByField(a: Product, b: Product, field: ProductOrdering["field"]): number {
  switch (field) {
    case "standard_code":
      return naturalCollator.compare(a.standard_code, b.standard_code);
    case "name":
      return naturalCollator.compare(a.name, b.name);
    case "description":
      return naturalCollator.compare(a.description, b.description);
    case "location":
      return naturalCollator.compare(
        a.storage_location_detail.code,
        b.storage_location_detail.code,
      );
    case "current_stock":
      return a.current_stock - b.current_stock;
    case "created_at":
      return Date.parse(a.created_at) - Date.parse(b.created_at);
    case "updated_at":
      return Date.parse(a.updated_at) - Date.parse(b.updated_at);
  }
}

/**
 * Ordena como la lista del backend (product_ordering_expressions): el
 * campo elegido y, de desempate, el código y el id, siempre ascendentes.
 */
export function sortProducts(products: Product[], ordering: ProductOrdering): Product[] {
  const sign = ordering.direction === "desc" ? -1 : 1;

  return [...products].sort(
    (a, b) =>
      sign * compareByField(a, b, ordering.field) ||
      compareByField(a, b, "standard_code") ||
      a.id - b.id,
  );
}

function isProductOrdering(value: unknown): value is ProductOrdering {
  if (!value || typeof value !== "object") {
    return false;
  }

  const ordering = value as Record<string, unknown>;

  return (
    PRODUCT_ORDERING_FIELD_OPTIONS.some((option) => option.value === ordering.field) &&
    (ordering.direction === "asc" || ordering.direction === "desc")
  );
}

/** El último orden elegido en la lista; el de por defecto si no hay. */
export function readStoredProductOrdering(): ProductOrdering {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;

    return isProductOrdering(parsed) ? parsed : DEFAULT_PRODUCT_ORDERING;
  } catch {
    return DEFAULT_PRODUCT_ORDERING;
  }
}

export function storeProductOrdering(ordering: ProductOrdering): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ordering));
  } catch {
    // localStorage puede fallar en modo privado o con el cupo lleno; la
    // lista sigue funcionando, solo no recuerda el orden.
  }
}
