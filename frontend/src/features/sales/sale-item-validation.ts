import type { SaleItemFormErrors, SaleItemFormValues } from "./types";

/**
 * defaultUnitPrice: precio de venta del producto elegido. Si el campo de
 * precio queda vacío y existe, la línea se crea con ese precio (el
 * backend lo completa). undefined = no hay producto elegido en este
 * formulario (modo edición).
 */
export function validateSaleItemForm(
  values: SaleItemFormValues,
  availableStock?: number,
  defaultUnitPrice?: string | null,
): SaleItemFormErrors {
  const errors: SaleItemFormErrors = {};

  if (!values.productId) {
    errors.productId = "El producto es obligatorio.";
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
    if (defaultUnitPrice === null) {
      errors.unitPrice = "Este producto no tiene precio de venta; el precio unitario es obligatorio.";
    } else if (defaultUnitPrice === undefined) {
      errors.unitPrice = "El precio unitario es obligatorio.";
    }
  } else if (Number.isNaN(Number(unitPrice)) || Number(unitPrice) <= 0) {
    errors.unitPrice = "El precio unitario debe ser un número mayor que cero.";
  }

  return errors;
}
