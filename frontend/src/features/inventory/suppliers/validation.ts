import type {
  SupplierFormErrors,
  SupplierFormValues,
} from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSupplierForm(
  values: SupplierFormValues,
): SupplierFormErrors {
  const errors: SupplierFormErrors = {};

  const name = values.name.trim();
  const contactName = values.contactName.trim();
  const phone = values.phone.trim();
  const email = values.email.trim();
  const country = values.country.trim();

  if (!name) {
    errors.name = "El nombre del proveedor es obligatorio.";
  } else if (name.length > 150) {
    errors.name = "El nombre no puede superar 150 caracteres.";
  }

  if (contactName.length > 150) {
    errors.contactName = "El nombre de contacto no puede superar 150 caracteres.";
  }

  if (phone.length > 30) {
    errors.phone = "El teléfono no puede superar 30 caracteres.";
  }

  if (email.length > 254) {
    errors.email = "El correo no puede superar 254 caracteres.";
  } else if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Ingrese un correo electrónico válido.";
  }

  if (country.length > 100) {
    errors.country = "El país no puede superar 100 caracteres.";
  }

  return errors;
}
