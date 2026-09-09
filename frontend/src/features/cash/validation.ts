import type { CashClosingFormErrors, CashClosingFormValues } from "./types";

const SATURDAY = 6; // Date.getDay(): domingo=0 ... sábado=6

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export function validateCashClosingForm(
  values: CashClosingFormValues,
  expectedCashTotal: string | null,
): CashClosingFormErrors {
  const errors: CashClosingFormErrors = {};

  if (!values.weekStart) {
    errors.weekStart = "Debe indicar la fecha de inicio de semana (sábado).";
  } else {
    const parsedDate = new Date(`${values.weekStart}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime()) || parsedDate.getDay() !== SATURDAY) {
      errors.weekStart = "La semana de un cierre de caja debe iniciar un sábado.";
    }
  }

  const countedCashTotal = values.countedCashTotal.trim();

  if (!countedCashTotal) {
    errors.countedCashTotal = "Debe indicar el efectivo contado.";
  } else if (
    !DECIMAL_PATTERN.test(countedCashTotal) ||
    Number(countedCashTotal) < 0
  ) {
    errors.countedCashTotal = "Ingrese un monto válido, mayor o igual a cero.";
  }

  if (
    expectedCashTotal !== null &&
    countedCashTotal &&
    DECIMAL_PATTERN.test(countedCashTotal) &&
    Number(countedCashTotal) !== Number(expectedCashTotal) &&
    !values.differenceReason.trim()
  ) {
    errors.differenceReason =
      "Debe indicar el motivo de la diferencia entre lo esperado y lo contado.";
  }

  return errors;
}
