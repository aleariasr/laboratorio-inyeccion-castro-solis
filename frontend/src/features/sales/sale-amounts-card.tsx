"use client";

import { useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  computeDocumentAmounts,
  DISCOUNT_TYPE_LABELS,
  formatPercentage,
  type DiscountType,
  type DocumentAmounts,
} from "@/lib/document-amounts";
import { ApiError } from "@/lib/api/errors";

import { formatMoney } from "../inventory/purchases/format";
import { updateSaleAmounts } from "./api";
import type { Sale } from "./types";

type SaleAmountsCardProps = {
  sale: Sale;
  canEdit: boolean;
  token: string;
  onSaved: (sale: Sale) => void;
  onUnauthorized: () => void;
};

type FieldErrors = {
  discountValue?: string;
  taxPercentage?: string;
};

// "50.0000" → "50", "13.00" → "13": así se ve en los campos.
function trimDecimal(value: string): string {
  return String(Number(value));
}

function linesSubtotal(sale: Sale): number {
  return sale.items.reduce((total, item) => total + Number(item.subtotal), 0);
}

function serverAmounts(sale: Sale): DocumentAmounts | null {
  if (sale.total === null) {
    return null;
  }

  return {
    subtotal: Number(sale.subtotal),
    discountAmount: Number(sale.discount_amount),
    taxAmount: Number(sale.tax_amount),
    total: Number(sale.total),
  };
}

export function SaleAmountsCard({
  sale,
  canEdit,
  token,
  onSaved,
  onUnauthorized,
}: SaleAmountsCardProps) {
  const [discountType, setDiscountType] = useState<DiscountType>(sale.discount_type);

  const [discountValue, setDiscountValue] = useState(trimDecimal(sale.discount_value));

  const [taxPercentage, setTaxPercentage] = useState(trimDecimal(sale.tax_percentage));

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<FieldErrors>({});

  const isDirty =
    discountType !== sale.discount_type ||
    Number(discountValue || 0) !== Number(sale.discount_value) ||
    Number(taxPercentage || 0) !== Number(sale.tax_percentage);

  // Mientras se edita: vista previa con lo escrito. Si no, lo que dice
  // el backend (que en una venta confirmada son los montos congelados).
  const preview = canEdit
    ? computeDocumentAmounts(
        linesSubtotal(sale),
        discountType,
        Number(discountValue || 0),
        Number(taxPercentage || 0),
      )
    : null;

  const amounts = preview
    ? preview.ok
      ? preview.amounts
      : null
    : serverAmounts(sale);

  const fieldErrors: FieldErrors = {
    ...serverErrors,
    ...(preview && !preview.ok ? { [preview.field]: preview.message } : {}),
  };

  function resetForm(): void {
    setDiscountType(sale.discount_type);
    setDiscountValue(trimDecimal(sale.discount_value));
    setTaxPercentage(trimDecimal(sale.tax_percentage));
    setSubmitError(null);
    setServerErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (isSubmitting || (preview && !preview.ok)) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const saved = await updateSaleAmounts(token, sale.id, {
        discount_type: discountType,
        discount_value: discountValue.trim() || "0",
        tax_percentage: taxPercentage.trim() || "0",
      });

      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const nextErrors: FieldErrors = {
          discountValue: error.fieldErrors.discount_value?.[0],
          taxPercentage: error.fieldErrors.tax_percentage?.[0],
        };

        setServerErrors(nextErrors);

        if (!nextErrors.discountValue && !nextErrors.taxPercentage) {
          setSubmitError(error.message);
        }

        return;
      }

      setSubmitError(
        error instanceof ApiError
          ? error.message
          : "No fue posible guardar el descuento y el impuesto.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Lo escrito mientras se edita; lo guardado en una venta cerrada.
  const shownDiscountType = canEdit ? discountType : sale.discount_type;
  const shownDiscountValue = canEdit ? discountValue || "0" : sale.discount_value;
  const shownTaxPercentage = canEdit ? taxPercentage || "0" : sale.tax_percentage;

  const discountLabel =
    shownDiscountType === "PERCENT" && Number(shownDiscountValue) > 0
      ? `Descuento (${formatPercentage(shownDiscountValue)} %)`
      : "Descuento";

  const summary = (
    <dl className="grid gap-2.5 rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] p-5 text-sm ring-1 ring-[rgb(7_81_132_/_12%)]">
      <div className="flex justify-between gap-4 text-muted-foreground">
        <dt>Subtotal</dt>
        <dd className="font-mono">
          ₡{formatMoney(amounts?.subtotal ?? linesSubtotal(sale))}
        </dd>
      </div>

      {(canEdit || (amounts && amounts.discountAmount > 0)) && (
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt>{discountLabel}</dt>
          <dd className="font-mono">
            {amounts ? `− ₡${formatMoney(amounts.discountAmount)}` : "—"}
          </dd>
        </div>
      )}

      {(canEdit || (amounts && amounts.taxAmount > 0)) && (
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt>Impuesto ({formatPercentage(shownTaxPercentage)} %)</dt>
          <dd className="font-mono">
            {amounts ? `₡${formatMoney(amounts.taxAmount)}` : "—"}
          </dd>
        </div>
      )}

      <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-[rgb(7_81_132_/_14%)] pt-3">
        <dt className="font-semibold text-foreground">Total</dt>
        <dd className="font-mono text-2xl font-semibold text-foreground">
          {amounts ? `₡${formatMoney(amounts.total)}` : "—"}
        </dd>
      </div>
    </dl>
  );

  return (
    <section className="app-status-card overflow-hidden">
      <div className="border-b border-[var(--color-border-soft)] p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
          {canEdit ? "Descuento e impuesto" : "Resumen de la venta"}
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          {canEdit
            ? "Se aplican a toda la venta: primero el descuento sobre el subtotal, después el impuesto sobre lo que queda."
            : "Montos tal como quedaron al confirmar la venta."}
        </p>
      </div>

      <div className="grid gap-6 p-6">
        {canEdit && !isDirty && sale.amounts_error && (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-warning-soft)] px-4 py-3 text-sm font-medium text-[var(--color-warning)]">
            {sale.amounts_error} Ajuste el descuento antes de confirmar la venta.
          </p>
        )}

        {canEdit ? (
          <form
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            noValidate
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start"
          >
            <div className="grid gap-5">
              {submitError && <FormError message={submitError} />}

              <Field
                id="sale-discount-value"
                label="Descuento"
                hint={
                  discountType === "AMOUNT"
                    ? "Monto en colones que se rebaja del subtotal."
                    : "Porcentaje del subtotal que se rebaja."
                }
                error={fieldErrors.discountValue}
              >
                <div className="flex gap-2">
                  <div
                    role="radiogroup"
                    aria-label="Tipo de descuento"
                    className="inline-flex shrink-0 rounded-[var(--radius-md)] border border-border bg-surface-muted p-1"
                  >
                    {(["AMOUNT", "PERCENT"] as DiscountType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={discountType === type}
                        onClick={() => {
                          setDiscountType(type);
                          setServerErrors({});
                        }}
                        disabled={isSubmitting}
                        className={[
                          "rounded-[calc(var(--radius-md)-4px)] px-3.5 text-sm font-semibold transition-colors",
                          discountType === type
                            ? "bg-surface text-primary shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        ].join(" ")}
                      >
                        {type === "AMOUNT" ? "₡ Monto" : "% Porcentaje"}
                      </button>
                    ))}
                  </div>

                  <Input
                    id="sale-discount-value"
                    value={discountValue}
                    onChange={(event) => {
                      setDiscountValue(event.target.value);
                      setServerErrors({});
                    }}
                    hasError={Boolean(fieldErrors.discountValue)}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    aria-label={`Descuento (${DISCOUNT_TYPE_LABELS[discountType].toLowerCase()})`}
                    disabled={isSubmitting}
                  />
                </div>
              </Field>

              <Field
                id="sale-tax-percentage"
                label="Impuesto (%)"
                hint="13 % por defecto. Póngalo en 0 si la venta no lleva impuesto."
                error={fieldErrors.taxPercentage}
              >
                <Input
                  id="sale-tax-percentage"
                  value={taxPercentage}
                  onChange={(event) => {
                    setTaxPercentage(event.target.value);
                    setServerErrors({});
                  }}
                  hasError={Boolean(fieldErrors.taxPercentage)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  disabled={isSubmitting}
                />
              </Field>

              {isDirty && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-surface-muted px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    Cambios sin guardar.
                  </p>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={resetForm}
                      disabled={isSubmitting}
                    >
                      Descartar
                    </Button>

                    <Button
                      type="submit"
                      isLoading={isSubmitting}
                      loadingText="Guardando…"
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {summary}
          </form>
        ) : (
          <div className="max-w-md">{summary}</div>
        )}
      </div>
    </section>
  );
}
