import type {
  ProductFormErrors,
  ProductFormValues,
} from "./types";

export function validateProductForm(
  values: ProductFormValues,
): ProductFormErrors {
  const errors: ProductFormErrors = {};

  const standardCode =
    values.standardCode.trim();

  const name = values.name.trim();

  const storageLocationId = Number(
    values.storageLocationId,
  );

  const minimumStock = Number(
    values.minimumStock,
  );

  const unitOfMeasure =
    values.unitOfMeasure.trim();

  if (!standardCode) {
    errors.standardCode =
      "El código estándar es obligatorio.";
  } else if (standardCode.length > 50) {
    errors.standardCode =
      "El código estándar no puede superar 50 caracteres.";
  }

  if (!name) {
    errors.name =
      "El nombre del producto es obligatorio.";
  } else if (name.length > 150) {
    errors.name =
      "El nombre no puede superar 150 caracteres.";
  }

  if (
    !Number.isInteger(storageLocationId) ||
    storageLocationId <= 0
  ) {
    errors.storageLocationId =
      "Seleccione una ubicación válida.";
  }

  if (
    !Number.isInteger(minimumStock) ||
    minimumStock < 0
  ) {
    errors.minimumStock =
      "El stock mínimo debe ser un número entero igual o mayor que cero.";
  }

  if (!unitOfMeasure) {
    errors.unitOfMeasure =
      "La unidad de medida es obligatoria.";
  } else if (unitOfMeasure.length > 20) {
    errors.unitOfMeasure =
      "La unidad de medida no puede superar 20 caracteres.";
  }

  return errors;
}
