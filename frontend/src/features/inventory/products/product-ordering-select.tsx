"use client";

import {
  PRODUCT_ORDERING_FIELD_OPTIONS,
  productOrderingDirectionLabel,
  type ProductOrdering,
  type ProductOrderingField,
} from "./types";

const SELECT_CLASSES =
  "h-11 min-w-0 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)] disabled:opacity-55";

type ProductOrderingSelectProps = {
  id: string;
  value: ProductOrdering;
  onChange: (ordering: ProductOrdering) => void;
  disabled?: boolean;
};

/**
 * Punto 2 del plan del 2026-10-22: campo y dirección del orden de
 * productos. Lo usan la lista y la ventana de etiquetas.
 */
export function ProductOrderingSelect({
  id,
  value,
  onChange,
  disabled = false,
}: ProductOrderingSelectProps) {
  return (
    <div className="flex min-w-0 gap-2">
      <select
        id={id}
        value={value.field}
        onChange={(event) => {
          onChange({
            ...value,
            field: event.target.value as ProductOrderingField,
          });
        }}
        disabled={disabled}
        aria-label="Ordenar por"
        className={`${SELECT_CLASSES} flex-1`}
      >
        {PRODUCT_ORDERING_FIELD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <select
        value={value.direction}
        onChange={(event) => {
          onChange({
            ...value,
            direction: event.target.value as ProductOrdering["direction"],
          });
        }}
        disabled={disabled}
        aria-label="Dirección del orden"
        className={`${SELECT_CLASSES} flex-1`}
      >
        <option value="asc">{productOrderingDirectionLabel(value.field, "asc")}</option>
        <option value="desc">{productOrderingDirectionLabel(value.field, "desc")}</option>
      </select>
    </div>
  );
}
