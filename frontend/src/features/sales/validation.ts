import type { SaleFormErrors, SaleFormValues } from "./types";

const CURRENCY_VALUES = ["CRC", "USD"];

export function validateSaleForm(values: SaleFormValues): SaleFormErrors {
  const errors: SaleFormErrors = {};

  if (!values.saleDate) {
    errors.saleDate = "La fecha de venta es obligatoria.";
  }

  if (!CURRENCY_VALUES.includes(values.currency)) {
    errors.currency = "Seleccione una moneda válida.";
  }

  const exchangeRate = values.exchangeRate.trim();

  if (!exchangeRate) {
    errors.exchangeRate = "El tipo de cambio es obligatorio.";
  } else if (Number.isNaN(Number(exchangeRate)) || Number(exchangeRate) <= 0) {
    errors.exchangeRate = "El tipo de cambio debe ser un número mayor que cero.";
  }

  return errors;
}
