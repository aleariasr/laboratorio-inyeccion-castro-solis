import type { InjectorFormErrors, InjectorFormValues } from "./types";

export function validateInjectorForm(
  values: InjectorFormValues,
): InjectorFormErrors {
  const errors: InjectorFormErrors = {};

  const injectorNumber = values.injectorNumber.trim();
  const description = values.description.trim();

  if (!values.customerId) {
    errors.customerId = "Debe seleccionar un cliente.";
  }

  if (!injectorNumber) {
    errors.injectorNumber = "El número de inyector es obligatorio.";
  } else if (injectorNumber.length > 100) {
    errors.injectorNumber = "El número no puede superar 100 caracteres.";
  }

  if (description.length > 255) {
    errors.description = "La descripción no puede superar 255 caracteres.";
  }

  return errors;
}
