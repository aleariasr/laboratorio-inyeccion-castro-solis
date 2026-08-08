import type {
  PurchaseItemFormErrors,
  PurchaseItemFormValues,
} from "./types";

export function validatePurchaseItemForm(
  values: PurchaseItemFormValues,
): PurchaseItemFormErrors {
  const errors: PurchaseItemFormErrors = {};

  if (!values.supplierProductId) {
    errors.supplierProductId = "Debe seleccionar un producto del proveedor.";
  }

  const quantity = values.quantity.trim();

  if (!quantity) {
    errors.quantity = "La cantidad es obligatoria.";
  } else if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
    errors.quantity = "La cantidad debe ser un número entero mayor que cero.";
  }

  const unitCost = values.unitCost.trim();

  if (!unitCost) {
    errors.unitCost = "El costo unitario es obligatorio.";
  } else if (Number.isNaN(Number(unitCost)) || Number(unitCost) <= 0) {
    errors.unitCost = "El costo unitario debe ser un número mayor que cero.";
  }

  return errors;
}
