"use client";

import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/inventory/purchases/format";

import { getCashClosingPreview } from "./api";
import type {
  CashClosingFormErrors,
  CashClosingFormValues,
  CashClosingPreview,
} from "./types";
import { validateCashClosingForm } from "./validation";

type CashClosingFormProps = {
  initialValues: CashClosingFormValues;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: CashClosingFormErrors;
  onSubmit: (values: CashClosingFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function mergeErrors(
  localErrors: CashClosingFormErrors,
  serverErrors: CashClosingFormErrors,
): CashClosingFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function CashClosingForm({
  initialValues,
  token,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: CashClosingFormProps) {
  const [values, setValues] = useState<CashClosingFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<CashClosingFormErrors>({});

  const [preview, setPreview] = useState<CashClosingPreview | null>(null);

  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const errors = mergeErrors(localErrors, serverErrors);

  useEffect(() => {
    if (!values.weekStart) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      setIsLoadingPreview(true);

      getCashClosingPreview(token, values.weekStart, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) {
            return;
          }

          setPreview(result);
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setPreview(null);
          setPreviewError(
            error instanceof Error
              ? error.message
              : "No fue posible calcular el efectivo esperado.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoadingPreview(false);
          }
        });
    }, 300);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
      setIsLoadingPreview(false);
    };
  }, [values.weekStart, token]);

  function updateValue(field: keyof CashClosingFormValues, value: string): void {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));

    setLocalErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };

      delete nextErrors[field];

      return nextErrors;
    });
  }

  // preview/previewError quedan de un fetch anterior mientras el
  // efecto para el weekStart actual todavía no resuelve (o si el
  // campo se vació) — se ignoran acá en vez de limpiarlos con un
  // setState síncrono dentro del efecto.
  const effectivePreview =
    preview && preview.week_start === values.weekStart ? preview : null;

  const effectivePreviewError = values.weekStart ? previewError : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateCashClosingForm(
      values,
      effectivePreview?.expected_cash_total ?? null,
    );

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    void onSubmit(values);
  }

  const difference =
    effectivePreview && values.countedCashTotal.trim()
      ? Number(values.countedCashTotal) -
        Number(effectivePreview.expected_cash_total)
      : null;

  const weekStartHint = isLoadingPreview
    ? "Calculando efectivo esperado…"
    : effectivePreview
      ? `Semana del ${effectivePreview.week_start} al ${effectivePreview.week_end}. Efectivo esperado: ₡${formatMoney(effectivePreview.expected_cash_total)}.`
      : "Elija el sábado de inicio de la semana a cerrar.";

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {submitError && <FormError message={submitError} />}

      <Field
        id="cash-closing-week-start"
        label="Inicio de semana (sábado)"
        required
        hint={weekStartHint}
        error={errors.weekStart || effectivePreviewError || undefined}
      >
        <Input
          id="cash-closing-week-start"
          type="date"
          value={values.weekStart}
          onChange={(event) => {
            updateValue("weekStart", event.target.value);
          }}
          hasError={Boolean(errors.weekStart || effectivePreviewError)}
          disabled={isSubmitting}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="cash-closing-counted"
          label="Efectivo contado"
          required
          error={errors.countedCashTotal}
        >
          <Input
            id="cash-closing-counted"
            value={values.countedCashTotal}
            onChange={(event) => {
              updateValue("countedCashTotal", event.target.value);
            }}
            hasError={Boolean(errors.countedCashTotal)}
            inputMode="decimal"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>

        {difference !== null && (
          <div className="flex flex-col justify-center">
            <p className="text-sm text-muted-foreground">Diferencia</p>
            <p
              className={[
                "font-mono text-lg font-semibold",
                difference === 0
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-danger)]",
              ].join(" ")}
            >
              {difference > 0 ? "+" : difference < 0 ? "-" : ""}
              ₡{formatMoney(Math.abs(difference))}
            </p>
          </div>
        )}
      </div>

      <Field
        id="cash-closing-difference-reason"
        label="Motivo de la diferencia"
        hint={
          difference && difference !== 0
            ? "Obligatorio porque el efectivo contado no coincide con el esperado."
            : "Solo se necesita si hay diferencia entre lo esperado y lo contado."
        }
        error={errors.differenceReason}
      >
        <Textarea
          id="cash-closing-difference-reason"
          value={values.differenceReason}
          onChange={(event) => {
            updateValue("differenceReason", event.target.value);
          }}
          hasError={Boolean(errors.differenceReason)}
          disabled={isSubmitting}
        />
      </Field>

      <Field id="cash-closing-notes" label="Notas" error={errors.notes}>
        <Textarea
          id="cash-closing-notes"
          value={values.notes}
          onChange={(event) => {
            updateValue("notes", event.target.value);
          }}
          hasError={Boolean(errors.notes)}
          disabled={isSubmitting}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--color-border-soft)] pt-5">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button type="submit" isLoading={isSubmitting} loadingText="Guardando…">
          Cerrar semana
        </Button>
      </div>
    </form>
  );
}
