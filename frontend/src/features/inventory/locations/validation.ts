import type {
  StorageLocationFormErrors,
  StorageLocationFormValues,
} from "./types";

const LOCATION_CODE_PATTERN =
  /^[A-Z][1-9][0-9]{0,3}$/;

export function validateStorageLocationForm(
  values: StorageLocationFormValues,
): StorageLocationFormErrors {
  const errors:
    StorageLocationFormErrors = {};

  const code =
    values.code.trim().toUpperCase();

  const description =
    values.description.trim();

  if (!code) {
    errors.code =
      "El código de ubicación es obligatorio.";
  } else if (code.length > 5) {
    errors.code =
      "El código no puede superar 5 caracteres.";
  } else if (
    !LOCATION_CODE_PATTERN.test(code)
  ) {
    errors.code =
      "Use un formato como A124: una letra, seguida de un número entre 1 y 9999.";
  }

  if (description.length > 255) {
    errors.description =
      "La descripción no puede superar 255 caracteres.";
  }

  return errors;
}