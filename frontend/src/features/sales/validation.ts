import { todayIsoDate } from "@/features/inventory/transfers/types";

import type { SaleFormErrors, SaleFormValues } from "./types";

export function validateSaleForm(values: SaleFormValues): SaleFormErrors {
  const errors: SaleFormErrors = {};

  if (!values.saleDate) {
    errors.saleDate = "La fecha de venta es obligatoria.";
  } else if (values.saleDate > todayIsoDate()) {
    // Mismo criterio que el backend (auditoría integral del 2026-11-07).
    errors.saleDate = "La fecha de la venta no puede ser futura.";
  }

  return errors;
}
