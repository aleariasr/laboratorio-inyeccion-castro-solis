import type {
  ImportCostFormErrors,
  ImportCostFormValues,
} from "./types";

const CURRENCY_VALUES = ["CRC", "USD"];

export function validateImportCostForm(
  values: ImportCostFormValues,
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

  return errors;
}
