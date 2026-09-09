import type {
  ServiceAccessoryFormErrors,
  ServiceAccessoryFormValues,
  ServicePriceFormErrors,
  ServicePriceFormValues,
  ServiceRecordCreateFormErrors,
  ServiceRecordCreateFormValues,
  ServiceRecordTechnicalFormErrors,
  ServiceRecordTechnicalFormValues,
} from "./types";

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export function validateServiceRecordCreateForm(
  values: ServiceRecordCreateFormValues,
): ServiceRecordCreateFormErrors {
  const errors: ServiceRecordCreateFormErrors = {};

  if (!values.injectorId) {
    errors.injectorId = "Debe seleccionar un inyector.";
  }

  if (!values.receivedAt) {
    errors.receivedAt = "La fecha de recepción es obligatoria.";
  }

  return errors;
}

export function validateServiceRecordTechnicalForm(
  values: ServiceRecordTechnicalFormValues,
): ServiceRecordTechnicalFormErrors {
  const errors: ServiceRecordTechnicalFormErrors = {};

  const resistance = values.resistance.trim();
  const leakage = values.leakage.trim();
  const inductance = values.inductance.trim();
  const isolation = values.isolation.trim();

  if (resistance && !DECIMAL_PATTERN.test(resistance)) {
    errors.resistance = "Ingrese un número válido (ej. 1.250).";
  }

  if (leakage && !DECIMAL_PATTERN.test(leakage)) {
    errors.leakage = "Ingrese un número válido (ej. 0.100).";
  }

  if (inductance && !DECIMAL_PATTERN.test(inductance)) {
    errors.inductance = "Ingrese un número válido (ej. 1.250).";
  }

  if (isolation && !DECIMAL_PATTERN.test(isolation)) {
    errors.isolation = "Ingrese un número válido (ej. 1.250).";
  }

  return errors;
}

export function validateServicePriceForm(
  values: ServicePriceFormValues,
): ServicePriceFormErrors {
  const errors: ServicePriceFormErrors = {};

  const price = values.price.trim();

  if (price) {
    if (!DECIMAL_PATTERN.test(price) || Number(price) <= 0) {
      errors.price = "Ingrese un precio válido mayor que cero.";
    }
  }

  return errors;
}

export function validateServiceAccessoryForm(
  values: ServiceAccessoryFormValues,
): ServiceAccessoryFormErrors {
  const errors: ServiceAccessoryFormErrors = {};

  if (!values.productId) {
    errors.productId = "Debe seleccionar un producto.";
  }

  const quantity = Number(values.quantity);

  if (!values.quantity.trim()) {
    errors.quantity = "La cantidad es obligatoria.";
  } else if (!Number.isInteger(quantity) || quantity <= 0) {
    errors.quantity = "La cantidad debe ser un número entero positivo.";
  }

  return errors;
}
