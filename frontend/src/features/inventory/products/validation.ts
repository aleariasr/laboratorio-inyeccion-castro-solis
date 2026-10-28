import type {
  ProductFormErrors,
  ProductFormValues,
  ProductVariantFormErrors,
  ProductVariantFormValues,
} from "./types";

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

const OWN_CODE_MAX_LENGTH = 50;

const OWN_CODE_TOO_LONG_MESSAGE =
  "El código propio no puede superar 50 caracteres.";

export function validateProductForm(
  values: ProductFormValues,
): ProductFormErrors {
  const errors: ProductFormErrors = {};

  const customSalePrice =
    values.customSalePrice.trim();

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

  if (values.ownCode.trim().length > OWN_CODE_MAX_LENGTH) {
    errors.ownCode = OWN_CODE_TOO_LONG_MESSAGE;
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
      "La ubicación no es válida.";
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

  if (
    customSalePrice &&
    (!DECIMAL_PATTERN.test(customSalePrice) ||
      Number(customSalePrice) <= 0)
  ) {
    errors.customSalePrice =
      "El precio debe ser mayor que cero, o quedar vacío.";
  }

  return errors;
}

export function validateProductVariantForm(
  values: ProductVariantFormValues,
): ProductVariantFormErrors {
  const errors: ProductVariantFormErrors = {};

  const name = values.name.trim();
  const unitOfMeasure = values.unitOfMeasure.trim();
  const customSalePrice = values.customSalePrice.trim();

  if (values.ownCode.trim().length > OWN_CODE_MAX_LENGTH) {
    errors.ownCode = OWN_CODE_TOO_LONG_MESSAGE;
  }

  if (!values.storageLocationId) {
    errors.storageLocationId = "La ubicación es obligatoria.";
  }

  if (!name) {
    errors.name = "El nombre del producto es obligatorio.";
  } else if (name.length > 150) {
    errors.name = "El nombre no puede superar 150 caracteres.";
  }

  if (unitOfMeasure && unitOfMeasure.length > 20) {
    errors.unitOfMeasure =
      "La unidad de medida no puede superar 20 caracteres.";
  }

  if (
    customSalePrice &&
    (!DECIMAL_PATTERN.test(customSalePrice) ||
      Number(customSalePrice) <= 0)
  ) {
    errors.customSalePrice =
      "El precio debe ser mayor que cero, o quedar vacío.";
  }

  return errors;
}
