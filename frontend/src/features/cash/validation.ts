import type { CashClosingFormErrors, CashClosingFormValues } from "./types";

const SATURDAY = 6; // Date.getDay(): domingo=0 ... sábado=6

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export function validateCashClosingForm(
  values: CashClosingFormValues,
  // Lo que debe haber al contar: lo cobrado más el saldo de caja chica.
  expectedTotal: string | null,
  // Lo dice el backend (preview.can_close): null mientras no se sabe.
  canClose: boolean | null = null,
): CashClosingFormErrors {
  const errors: CashClosingFormErrors = {};

  if (!values.weekStart) {
    errors.weekStart = "La fecha de inicio de semana (sábado) es obligatoria.";
  } else {
    const parsedDate = new Date(`${values.weekStart}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime()) || parsedDate.getDay() !== SATURDAY) {
      errors.weekStart = "La semana de un cierre de caja debe iniciar un sábado.";
    } else if (canClose === false) {
      errors.weekStart =
        "Esta semana todavía no ha terminado: se puede cerrar a partir de su viernes.";
    }
  }

  const countedTotal = values.countedTotal.trim();

  if (!countedTotal) {
    errors.countedTotal = "El total contado es obligatorio.";
  } else if (
    !DECIMAL_PATTERN.test(countedTotal) ||
    Number(countedTotal) < 0
  ) {
    errors.countedTotal = "El monto debe ser un número mayor o igual a cero.";
  }

  // Caja chica: opcionales, pero si se escriben deben ser montos válidos.
  for (const field of ["pettyCashOpening", "nextPettyCashOpening"] as const) {
    const value = values[field].trim();

    if (value && !DECIMAL_PATTERN.test(value)) {
      errors[field] = "El monto debe ser un número mayor o igual a cero.";
    }
  }

  if (
    expectedTotal !== null &&
    countedTotal &&
    DECIMAL_PATTERN.test(countedTotal) &&
    Number(countedTotal) !== Number(expectedTotal) &&
    !values.differenceReason.trim()
  ) {
    errors.differenceReason =
      "El motivo de la diferencia entre lo esperado y lo contado es obligatorio.";
  }

  return errors;
}
