import { validateExchangeRate } from "./exchange-rate";
import type {
  PurchaseFormErrors,
  PurchaseFormValues,
} from "./types";

const CURRENCY_VALUES = ["CRC", "USD"];

export function validatePurchaseForm(
  values: PurchaseFormValues,
): PurchaseFormErrors {
  const errors: PurchaseFormErrors = {};

  const invoiceNumber = values.invoiceNumber.trim();

  if (!values.supplierId) {
    errors.supplierId = "El proveedor es obligatorio.";
  }

  if (!invoiceNumber) {
    errors.invoiceNumber = "El número de factura es obligatorio.";
  } else if (invoiceNumber.length > 100) {
    errors.invoiceNumber = "El número de factura no puede superar 100 caracteres.";
  }

  if (!values.purchaseDate) {
    errors.purchaseDate = "La fecha de compra es obligatoria.";
  }

  if (!CURRENCY_VALUES.includes(values.currency)) {
    errors.currency = "La moneda no es válida.";
  }

  // Antes solo se pedía un número mayor que cero, y una compra en dólares
  // con el 1 que quedaba al cambiar la moneda dejaba los precios en ×1.
  const exchangeRateError = validateExchangeRate(values.currency, values.exchangeRate);

  if (exchangeRateError) {
    errors.exchangeRate = exchangeRateError;
  }

  return errors;
}
