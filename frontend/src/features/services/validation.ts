import { computeDocumentAmounts } from "@/lib/document-amounts";

import type {
  ServiceAccessoryFormErrors,
  ServiceAccessoryFormValues,
  ServicePriceFormErrors,
  ServicePriceFormValues,
  ServiceRecordCreateFormErrors,
  ServiceRecordCreateFormValues,
  ServiceRecordTechnicalFormErrors,
  ServiceRecordTechnicalFormValues,
  ServiceTypeFormErrors,
  ServiceTypeFormValues,
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
  subtotal: number | null,
): ServicePriceFormErrors {
  const errors: ServicePriceFormErrors = {};

  // Mismas reglas que el backend (apps/core/money.py). Sin subtotal (sin
  // líneas ni accesorios) solo se validan los rangos.
  const discountValue = Number(values.discountValue.trim() || 0);
  const amounts = computeDocumentAmounts(
    subtotal ?? discountValue,
    values.discountType,
    discountValue,
    Number(values.taxPercentage.trim() || 0),
  );

  if (!amounts.ok) {
    errors[amounts.field] = amounts.message;
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

export function validateServiceTypeForm(
  values: ServiceTypeFormValues,
): ServiceTypeFormErrors {
  const errors: ServiceTypeFormErrors = {};

  const name = values.name.trim();
  const laborPrice = values.defaultLaborPrice.trim();

  if (!name) {
    errors.name = "El nombre del tipo de servicio es obligatorio.";
  } else if (name.length > 150) {
    errors.name = "El nombre no puede superar 150 caracteres.";
  }

  if (laborPrice && (!DECIMAL_PATTERN.test(laborPrice) || Number(laborPrice) <= 0)) {
    errors.defaultLaborPrice = "Ingrese un precio mayor que cero, o déjelo vacío.";
  }

  return errors;
}
