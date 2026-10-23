"use client";

import { useState, type FormEvent } from "react";

import { AmountsSummary } from "@/components/documents/amounts-summary";
import { DiscountTaxFields } from "@/components/documents/discount-tax-fields";
import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { computeDocumentAmounts } from "@/lib/document-amounts";

import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
  type ServicePriceFormErrors,
  type ServicePriceFormField,
  type ServicePriceFormValues,
} from "./types";
import { validateServicePriceForm } from "./validation";

type ServicePriceFormProps = {
  initialValues: ServicePriceFormValues;
  // Líneas de cobro + accesorios (lo calcula el backend). Null si todavía
  // no hay nada que cobrar.
  subtotal: number | null;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ServicePriceFormErrors;
  onSubmit: (values: ServicePriceFormValues) => void | Promise<void>;
};

/**
 * Descuento, impuesto y método de pago del servicio (punto 26). El
 * precio ya no se escribe aquí: es la suma de las líneas de cobro y los
 * accesorios (punto 3 + 1B del plan del 2026-10-22).
 */
export function ServicePriceForm({
  initialValues,
  subtotal,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
}: ServicePriceFormProps) {
  const [values, setValues] = useState<ServicePriceFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<ServicePriceFormErrors>({});

  const errors = { ...serverErrors, ...localErrors };

  function updateValue(field: ServicePriceFormField, value: string): void {
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

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateServicePriceForm(values, subtotal);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    void onSubmit(values);
  }

  // Vista previa de lo que se va a cobrar; lo que se guarda lo calcula el
  // backend (punto 26).
  const livePreviewResult =
    subtotal !== null
      ? computeDocumentAmounts(
          subtotal,
          values.discountType,
          Number(values.discountValue || 0),
          Number(values.taxPercentage || 0),
        )
      : null;

  const livePreview =
    livePreviewResult && livePreviewResult.ok ? livePreviewResult.amounts : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {submitError && <FormError message={submitError} />}

      <DiscountTaxFields
        idPrefix="service"
        discountType={values.discountType}
        discountValue={values.discountValue}
        taxPercentage={values.taxPercentage}
        onDiscountTypeChange={(value) => {
          updateValue("discountType", value);
        }}
        onDiscountValueChange={(value) => {
          updateValue("discountValue", value);
        }}
        onTaxPercentageChange={(value) => {
          updateValue("taxPercentage", value);
        }}
        discountError={errors.discountValue}
        taxError={errors.taxPercentage}
        disabled={isSubmitting}
      />

      <AmountsSummary
        amounts={livePreview}
        fallbackSubtotal={subtotal}
        discountType={values.discountType}
        discountValue={values.discountValue || "0"}
        taxPercentage={values.taxPercentage || "0"}
        showZeroRows
        subtotalLabel="Subtotal (líneas y accesorios)"
      />

      <Field
        id="service-payment-method"
        label="Método de pago"
        required
        error={errors.paymentMethod}
      >
        <select
          id="service-payment-method"
          value={values.paymentMethod}
          onChange={(event) => {
            updateValue("paymentMethod", event.target.value as PaymentMethod);
          }}
          disabled={isSubmitting}
          className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
        >
          {PAYMENT_METHOD_OPTIONS.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex justify-end border-t border-[var(--color-border-soft)] pt-5">
        <Button type="submit" isLoading={isSubmitting} loadingText="Guardando…">
          Guardar descuento, impuesto y pago
        </Button>
      </div>
    </form>
  );
}
