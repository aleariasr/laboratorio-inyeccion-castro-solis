import type { UserFormErrors, UserFormValues } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[\w.@+-]+$/;

export function validateUserForm(
  values: UserFormValues,
  mode: "create" | "edit",
): UserFormErrors {
  const errors: UserFormErrors = {};

  const username = values.username.trim();
  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();
  const email = values.email.trim();

  if (!username) {
    errors.username = "El usuario es obligatorio.";
  } else if (username.length > 150) {
    errors.username = "El usuario no puede superar 150 caracteres.";
  } else if (!USERNAME_PATTERN.test(username)) {
    errors.username = "Use solo letras, números y los símbolos @ . + - _";
  }

  if (mode === "create") {
    if (!values.password) {
      errors.password = "La contraseña es obligatoria.";
    } else if (values.password.length < 8) {
      errors.password = "La contraseña debe tener al menos 8 caracteres.";
    }
  }

  if (firstName.length > 150) {
    errors.firstName = "El nombre no puede superar 150 caracteres.";
  }

  if (lastName.length > 150) {
    errors.lastName = "El apellido no puede superar 150 caracteres.";
  }

  if (email.length > 254) {
    errors.email = "El correo no puede superar 254 caracteres.";
  } else if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Ingrese un correo electrónico válido.";
  }

  return errors;
}
