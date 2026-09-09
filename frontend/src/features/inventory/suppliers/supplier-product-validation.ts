import type {
  SupplierProductFormErrors,
  SupplierProductFormValues,
} from "./types";

export function validateSupplierProductForm(
  values: SupplierProductFormValues,
): SupplierProductFormErrors {
  const errors: SupplierProductFormErrors = {};

  const productId = Number(values.productId);
  const manufacturer = values.manufacturer.trim();

  if (!Number.isInteger(productId) || productId <= 0) {
    errors.productId = "Seleccione un producto válido.";
  }

  if (manufacturer.length > 100) {
    errors.manufacturer = "El fabricante no puede superar 100 caracteres.";
  }

  return errors;
}
