import type {
  StorageLocationFormErrors,
  StorageLocationFormValues,
} from "./types";

const LOCATION_CODE_PATTERN =
  /^[A-Za-z0-9]+$/;

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
  } else if (code.length > 10) {
    errors.code =
      "El código no puede superar 10 caracteres.";
  } else if (
    !LOCATION_CODE_PATTERN.test(code)
  ) {
    errors.code =
      "El código solo puede tener letras y números, sin espacios.";
  }

  if (description.length > 255) {
    errors.description =
      "La descripción no puede superar 255 caracteres.";
  }

  return errors;
}