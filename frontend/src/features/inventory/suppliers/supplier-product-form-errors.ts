import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  SupplierProductFormErrors,
  SupplierProductFormField,
} from "./types";

const FIELD_MAP: Record<string, SupplierProductFormField> = {
  product: "productId",
  supplier_reference: "supplierReference",
  manufacturer: "manufacturer",
  preferred_supplier: "preferredSupplier",
  notes: "notes",
  is_active: "isActive",
};

export function mapSupplierProductApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): SupplierProductFormErrors {
  const mappedErrors: SupplierProductFormErrors = {};

  for (const [apiField, messages] of Object.entries(fieldErrors)) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
