"use client";

import { useState, type FormEvent } from "react";

import { AmountsSummary } from "@/components/documents/amounts-summary";
import { DiscountTaxFields } from "@/components/documents/discount-tax-fields";
import { FormError } from "@/components/feedback/form-error";
import { Button } from "@/components/ui/button";
import {
  computeDocumentAmounts,
  type DiscountType,
  type DocumentAmounts,
} from "@/lib/document-amounts";
import { ApiError } from "@/lib/api/errors";

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

  const summary = (
    <AmountsSummary
      amounts={amounts}
      fallbackSubtotal={linesSubtotal(sale)}
      discountType={canEdit ? discountType : sale.discount_type}
      discountValue={canEdit ? discountValue || "0" : sale.discount_value}
      taxPercentage={canEdit ? taxPercentage || "0" : sale.tax_percentage}
      showZeroRows={canEdit}
    />
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

              <DiscountTaxFields
                idPrefix="sale"
                discountType={discountType}
                discountValue={discountValue}
                taxPercentage={taxPercentage}
                onDiscountTypeChange={(value) => {
                  setDiscountType(value);
                  setServerErrors({});
                }}
                onDiscountValueChange={(value) => {
                  setDiscountValue(value);
                  setServerErrors({});
                }}
                onTaxPercentageChange={(value) => {
                  setTaxPercentage(value);
                  setServerErrors({});
                }}
                discountError={fieldErrors.discountValue}
                taxError={fieldErrors.taxPercentage}
                disabled={isSubmitting}
              />

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
