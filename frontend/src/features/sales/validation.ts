import type { SaleFormErrors, SaleFormValues } from "./types";

export function validateSaleForm(values: SaleFormValues): SaleFormErrors {
  const errors: SaleFormErrors = {};

  if (!values.saleDate) {
    errors.saleDate = "La fecha de venta es obligatoria.";
  }

  return errors;
}
