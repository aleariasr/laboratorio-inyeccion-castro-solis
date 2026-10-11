"use client";

import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import {
  DISCOUNT_TYPE_LABELS,
  type DiscountType,
} from "@/lib/document-amounts";

type DiscountTaxFieldsProps = {
  idPrefix: string;
  discountType: DiscountType;
  discountValue: string;
  taxPercentage: string;
  onDiscountTypeChange: (value: DiscountType) => void;
  onDiscountValueChange: (value: string) => void;
  onTaxPercentageChange: (value: string) => void;
  discountError?: string;
  taxError?: string;
  disabled?: boolean;
};

/**
 * Descuento (monto o porcentaje) e impuesto de un documento: venta y
 * servicio usan este mismo bloque para verse y comportarse igual.
 */
export function DiscountTaxFields({
  idPrefix,
  discountType,
  discountValue,
  taxPercentage,
  onDiscountTypeChange,
  onDiscountValueChange,
  onTaxPercentageChange,
  discountError,
  taxError,
  disabled = false,
}: DiscountTaxFieldsProps) {
  return (
    <>
      <Field
        id={`${idPrefix}-discount-value`}
        label="Descuento"
        hint={
          discountType === "AMOUNT"
            ? "Monto en colones que se rebaja del subtotal."
            : "Porcentaje del subtotal que se rebaja."
        }
        error={discountError}
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
                  onDiscountTypeChange(type);
                }}
                disabled={disabled}
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
            id={`${idPrefix}-discount-value`}
            value={discountValue}
            onChange={(event) => {
              onDiscountValueChange(event.target.value);
            }}
            hasError={Boolean(discountError)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            aria-label={`Descuento (${DISCOUNT_TYPE_LABELS[discountType].toLowerCase()})`}
            disabled={disabled}
          />
        </div>
      </Field>

      <Field
        id={`${idPrefix}-tax-percentage`}
        label="Impuesto (%)"
        hint="13 % por defecto. Póngalo en 0 si no lleva impuesto."
        error={taxError}
      >
        <Input
          id={`${idPrefix}-tax-percentage`}
          value={taxPercentage}
          onChange={(event) => {
            onTaxPercentageChange(event.target.value);
          }}
          hasError={Boolean(taxError)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          disabled={disabled}
        />
      </Field>
    </>
  );
}
