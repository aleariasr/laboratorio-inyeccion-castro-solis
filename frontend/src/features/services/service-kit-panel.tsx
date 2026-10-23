"use client";

import { useState } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/errors";

import { addServiceAccessoriesBulk } from "./api";
import type { ServiceTypeDetail } from "./types";

type ServiceKitPanelProps = {
  token: string;
  serviceRecordId: number;
  serviceType: ServiceTypeDetail;
  onApplied: () => void | Promise<void>;
  onDismiss: () => void;
  onUnauthorized: () => void;
};

type KitRow = {
  productId: number;
  label: string;
  quantity: string;
  included: boolean;
};

/**
 * Propone el kit de un tipo de servicio (punto 1A/1B del plan del
 * 2026-10-22): los productos con su cantidad, que se pueden ajustar o
 * desmarcar antes de agregarlos. Se agregan todos juntos o ninguno (si a
 * uno le falta inventario); si un producto ya está en el servicio, se suma
 * a su cantidad.
 */
export function ServiceKitPanel({
  token,
  serviceRecordId,
  serviceType,
  onApplied,
  onDismiss,
  onUnauthorized,
}: ServiceKitPanelProps) {
  const [rows, setRows] = useState<KitRow[]>(() =>
    serviceType.kit_items.map((item) => ({
      productId: item.product,
      label: `${item.product_detail.standard_code} — ${item.product_detail.name}`,
      quantity: String(item.quantity),
      included: true,
    })),
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  function updateRow(productId: number, changes: Partial<KitRow>): void {
    setError(null);
    setRows((current) =>
      current.map((row) => (row.productId === productId ? { ...row, ...changes } : row)),
    );
  }

  async function handleApply(): Promise<void> {
    const items = rows
      .filter((row) => row.included)
      .map((row) => ({ product: row.productId, quantity: Number(row.quantity) }));

    if (items.length === 0) {
      onDismiss();
      return;
    }

    if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      setError("Cada producto marcado necesita una cantidad entera de 1 o más.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await addServiceAccessoriesBulk(token, serviceRecordId, items);
      await onApplied();
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }

      setError(
        caught instanceof ApiError ? caught.message : "No fue posible agregar los accesorios.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] p-4 ring-1 ring-[rgb(7_81_132_/_12%)] sm:p-5">
      <div>
        <p className="text-sm font-semibold text-foreground">
          Accesorios que suele llevar {serviceType.name}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Al agregarlos se descuentan del inventario. Se pueden ajustar las cantidades o desmarcar
          los que no se usaron.
        </p>
      </div>

      {error && <FormError message={error} />}

      <ul className="grid gap-2">
        {rows.map((row) => (
          <li
            key={row.productId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-surface px-3 py-2"
          >
            <label className="flex min-w-0 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={row.included}
                onChange={(event) => {
                  updateRow(row.productId, { included: event.target.checked });
                }}
                disabled={isSubmitting}
                className="size-4 accent-[var(--color-primary)]"
              />
              <span className="truncate text-sm text-foreground">{row.label}</span>
            </label>

            <Input
              value={row.quantity}
              onChange={(event) => {
                updateRow(row.productId, { quantity: event.target.value });
              }}
              inputMode="numeric"
              aria-label={`Cantidad de ${row.label}`}
              className="h-9 w-20 text-center"
              disabled={isSubmitting || !row.included}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDismiss} disabled={isSubmitting}>
          Ahora no
        </Button>

        <Button
          type="button"
          onClick={() => {
            void handleApply();
          }}
          isLoading={isSubmitting}
          loadingText="Agregando…"
        >
          Agregar accesorios
        </Button>
      </div>
    </div>
  );
}
