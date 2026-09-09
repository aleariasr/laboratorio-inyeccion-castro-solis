import type { ApiFieldErrors } from "@/lib/api/types";

import type {
  ProductFormErrors,
  ProductFormField,
  ProductVariantFormErrors,
  ProductVariantFormField,
} from "./types";

const FIELD_MAP: Record<
  string,
  ProductFormField
> = {
  standard_code: "standardCode",
  name: "name",
  description: "description",
  storage_location: "storageLocationId",
  minimum_stock: "minimumStock",
  unit_of_measure: "unitOfMeasure",
  custom_sale_price: "customSalePrice",
  variant_kind: "variantKind",
  is_active: "isActive",
};

export function mapProductApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): ProductFormErrors {
  const mappedErrors: ProductFormErrors = {};

  for (const [apiField, messages] of Object.entries(
    fieldErrors,
  )) {
    const formField = FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}

const VARIANT_FIELD_MAP: Record<
  string,
  ProductVariantFormField
> = {
  name: "name",
  description: "description",
  variant_kind: "variantKind",
  unit_of_measure: "unitOfMeasure",
  custom_sale_price: "customSalePrice",
};

export function mapProductVariantApiFieldErrors(
  fieldErrors: ApiFieldErrors,
): ProductVariantFormErrors {
  const mappedErrors: ProductVariantFormErrors = {};

  for (const [apiField, messages] of Object.entries(
    fieldErrors,
  )) {
    const formField = VARIANT_FIELD_MAP[apiField];
    const firstMessage = messages[0];

    if (formField && firstMessage) {
      mappedErrors[formField] = firstMessage;
    }
  }

  return mappedErrors;
}
