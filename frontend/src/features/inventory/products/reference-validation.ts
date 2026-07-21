import type {
  ProductReferenceFormErrors,
  ProductReferenceFormValues,
} from "./types";

export function validateProductReferenceForm(
  values: ProductReferenceFormValues,
): ProductReferenceFormErrors {
  const errors: ProductReferenceFormErrors = {};

  const manufacturer =
    values.manufacturer.trim();

  const referenceCode =
    values.referenceCode.trim();

  const description =
    values.description.trim();

  if (manufacturer.length > 100) {
    errors.manufacturer =
      "El fabricante no puede superar 100 caracteres.";
  }

  if (!referenceCode) {
    errors.referenceCode =
      "El código de referencia es obligatorio.";
  } else if (referenceCode.length > 80) {
    errors.referenceCode =
      "El código de referencia no puede superar 80 caracteres.";
  }

  if (description.length > 255) {
    errors.description =
      "La descripción no puede superar 255 caracteres.";
  }

  return errors;
}
