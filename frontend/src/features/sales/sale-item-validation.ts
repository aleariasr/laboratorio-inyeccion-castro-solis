import type { SaleItemFormErrors, SaleItemFormValues } from "./types";

export function validateSaleItemForm(
  values: SaleItemFormValues,
  availableStock?: number,
): SaleItemFormErrors {
  const errors: SaleItemFormErrors = {};

  if (!values.productId) {
    errors.productId = "Debe seleccionar un producto.";
  }

  const quantity = values.quantity.trim();

  if (!quantity) {
    errors.quantity = "La cantidad es obligatoria.";
  } else if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
    errors.quantity = "La cantidad debe ser un número entero mayor que cero.";
  } else if (
    availableStock !== undefined &&
    Number(quantity) > availableStock
  ) {
    errors.quantity = `No hay inventario suficiente (disponible: ${availableStock}).`;
  }

  const unitPrice = values.unitPrice.trim();

  if (!unitPrice) {
    errors.unitPrice = "El precio unitario es obligatorio.";
  } else if (Number.isNaN(Number(unitPrice)) || Number(unitPrice) <= 0) {
    errors.unitPrice = "El precio unitario debe ser un número mayor que cero.";
  }

  return errors;
}
