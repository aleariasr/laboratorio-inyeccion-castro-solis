import type {
  InventoryCountFormErrors,
  InventoryCountFormValues,
} from "./types";

export function validateInventoryCountForm(
  values: InventoryCountFormValues,
): InventoryCountFormErrors {
  const errors: InventoryCountFormErrors = {};

  const reference = values.reference.trim();

  if (!reference) {
    errors.reference = "La referencia es obligatoria.";
  } else if (reference.length > 50) {
    errors.reference = "La referencia no puede superar 50 caracteres.";
  }

  if (!values.countDate) {
    errors.countDate = "La fecha del conteo es obligatoria.";
  }

  return errors;
}
