import { validateExchangeRate } from "./exchange-rate";
import type {
  ImportCostFormErrors,
  ImportCostFormValues,
} from "./types";

const CURRENCY_VALUES = ["CRC", "USD"];

/**
 * El tipo de cambio de un costo depende solo de la moneda del costo (no de
 * la de la compra): en colones no aplica; en dólares es el ₡ por US$1 con
 * que se pagó, con el mismo rango que el de la compra.
 */
export function validateImportCostForm(
  values: ImportCostFormValues,
): ImportCostFormErrors {
  const errors: ImportCostFormErrors = {};

  if (!values.categoryId) {
    errors.categoryId = "La categoría de costo es obligatoria.";
  }

  const description = values.description.trim();

  if (description.length > 255) {
    errors.description = "La descripción no puede superar 255 caracteres.";
  }

  const amount = values.amount.trim();

  if (!amount) {
    errors.amount = "El monto es obligatorio.";
  } else if (Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    errors.amount = "El monto debe ser un número mayor que cero.";
  }

  if (!CURRENCY_VALUES.includes(values.currency)) {
    errors.currency = "La moneda no es válida.";
  }

  const exchangeRateError = validateExchangeRate(values.currency, values.exchangeRate);

  if (exchangeRateError) {
    errors.exchangeRate = exchangeRateError;
  }

  return errors;
}
