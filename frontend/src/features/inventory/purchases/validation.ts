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
  const exchangeRate = values.exchangeRate.trim();

  if (!values.supplierId) {
    errors.supplierId = "Debe seleccionar un proveedor.";
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
    errors.currency = "Seleccione una moneda válida.";
  }

  if (!exchangeRate) {
    errors.exchangeRate = "El tipo de cambio es obligatorio.";
  } else if (Number.isNaN(Number(exchangeRate)) || Number(exchangeRate) <= 0) {
    errors.exchangeRate = "El tipo de cambio debe ser un número mayor que cero.";
  }

  return errors;
}
