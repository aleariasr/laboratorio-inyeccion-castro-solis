import type {
  Currency,
  ImportCostFormErrors,
  ImportCostFormValues,
} from "./types";

const CURRENCY_VALUES = ["CRC", "USD"];

export function validateImportCostForm(
  values: ImportCostFormValues,
  purchaseCurrency: Currency,
): ImportCostFormErrors {
  const errors: ImportCostFormErrors = {};

  if (!values.categoryId) {
    errors.categoryId = "Debe seleccionar una categoría de costo.";
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
    errors.currency = "Seleccione una moneda válida.";
  }

  const exchangeRate = values.exchangeRate.trim();

  if (!exchangeRate) {
    errors.exchangeRate = "El tipo de cambio es obligatorio.";
  } else if (Number.isNaN(Number(exchangeRate)) || Number(exchangeRate) <= 0) {
    errors.exchangeRate = "El tipo de cambio debe ser un número mayor que cero.";
  } else if (
    values.currency === purchaseCurrency &&
    Number(exchangeRate) !== 1
  ) {
    errors.exchangeRate = "Debe ser 1 cuando la moneda coincide con la de la compra.";
  } else if (
    values.currency !== purchaseCurrency &&
    Number(exchangeRate) === 1
  ) {
    errors.exchangeRate = "No puede ser exactamente 1 cuando las monedas son distintas. Verifique el tipo de cambio real.";
  }

  return errors;
}
