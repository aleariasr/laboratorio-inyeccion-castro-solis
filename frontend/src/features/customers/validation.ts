import type { CustomerFormErrors, CustomerFormValues } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCustomerForm(
  values: CustomerFormValues,
): CustomerFormErrors {
  const errors: CustomerFormErrors = {};

  const displayName = values.displayName.trim();
  const phone = values.phone.trim();
  const email = values.email.trim();
  const identification = values.identification.trim();

  if (!displayName) {
    errors.displayName = "El nombre del cliente es obligatorio.";
  } else if (displayName.length > 150) {
    errors.displayName = "El nombre no puede superar 150 caracteres.";
  }

  if (phone.length > 30) {
    errors.phone = "El teléfono no puede superar 30 caracteres.";
  }

  if (email.length > 254) {
    errors.email = "El correo no puede superar 254 caracteres.";
  } else if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Ingrese un correo electrónico válido.";
  }

  if (identification.length > 50) {
    errors.identification = "La identificación no puede superar 50 caracteres.";
  }

  return errors;
}
