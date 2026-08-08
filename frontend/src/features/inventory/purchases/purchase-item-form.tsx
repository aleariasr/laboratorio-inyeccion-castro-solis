"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { searchSupplierProducts } from "./api";
import { validatePurchaseItemForm } from "./purchase-item-validation";
import type {
  PurchaseItemFormErrors,
  PurchaseItemFormField,
  PurchaseItemFormValues,
  SupplierProduct,
} from "./types";

type PurchaseItemFormMode = "create" | "edit";

type PurchaseItemFormProps = {
  mode: PurchaseItemFormMode;
  initialValues: PurchaseItemFormValues;
  supplierId: number;
  supplierProductDisplayLabel?: string;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: PurchaseItemFormErrors;
  onSubmit: (values: PurchaseItemFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function mergeErrors(
  localErrors: PurchaseItemFormErrors,
  serverErrors: PurchaseItemFormErrors,
): PurchaseItemFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

function formatSupplierProductLabel(supplierProduct: SupplierProduct): string {
  return `${supplierProduct.product_detail.standard_code} — ${supplierProduct.product_detail.name}`;
}

export function PurchaseItemForm({
  mode,
  initialValues,
  supplierId,
  supplierProductDisplayLabel,
  token,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: PurchaseItemFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<PurchaseItemFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<PurchaseItemFormErrors>({});

  const [selectedLabel, setSelectedLabel] = useState<string | null>(
    mode === "edit" ? supplierProductDisplayLabel ?? null : null,
  );

  const [query, setQuery] = useState("");

  const [results, setResults] = useState<SupplierProduct[]>([]);

  const [isListOpen, setIsListOpen] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  const errors = mergeErrors(localErrors, serverErrors);

  useEffect(() => {
    if (mode === "edit") {
      return;
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      searchSupplierProducts(token, supplierId, trimmedQuery, controller.signal)
        .then((supplierProducts) => {
          if (controller.signal.aborted) {
            return;
          }

          setResults(supplierProducts);
          setSearchError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setSearchError("No fue posible buscar productos del proveedor.");
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [mode, query, supplierId, token]);

  function updateValue(field: PurchaseItemFormField, value: string): void {
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

  function handleChange(field: Exclude<PurchaseItemFormField, "supplierProductId">) {
    return (event: ChangeEvent<HTMLInputElement>): void => {
      updateValue(field, event.target.value);
    };
  }

  function selectSupplierProduct(supplierProduct: SupplierProduct): void {
    updateValue("supplierProductId", String(supplierProduct.id));
    setSelectedLabel(formatSupplierProductLabel(supplierProduct));
    setQuery("");
    setResults([]);
    setIsListOpen(false);
  }

  function clearSelected(): void {
    updateValue("supplierProductId", "");
    setSelectedLabel(null);
    setQuery("");
    setResults([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validatePurchaseItemForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const firstInvalidField = formRef.current?.querySelector<HTMLInputElement>("[aria-invalid='true']");

      firstInvalidField?.focus();
      return;
    }

    void onSubmit(values);
  }

  const submitLabel = mode === "create" ? "Agregar línea" : "Guardar cambios";

  const submittingLabel = mode === "create" ? "Agregando línea…" : "Guardando cambios…";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-5"
    >
      {submitError && <FormError message={submitError} />}

      <Field
        id="purchase-item-supplier-product"
        label="Producto del proveedor"
        required
        hint={
          mode === "create"
            ? "Busque por referencia, fabricante o producto. Solo productos activos de este proveedor."
            : "El producto de la línea no puede modificarse; elimine la línea y cree una nueva si desea cambiarlo."
        }
        error={errors.supplierProductId}
      >
        {mode === "edit" ? (
          <div className="flex h-11 items-center rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 text-sm font-medium text-foreground">
            {selectedLabel ?? "Producto no disponible"}
          </div>
        ) : selectedLabel ? (
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">{selectedLabel}</span>

            <button
              type="button"
              onClick={clearSelected}
              className="text-xs font-semibold text-primary hover:underline"
              disabled={isSubmitting}
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="relative">
            <Input
              id="purchase-item-supplier-product"
              value={query}
              onChange={(event) => {
                const nextValue = event.target.value;

                setQuery(nextValue);
                setIsListOpen(true);

                if (nextValue.trim().length < 2) {
                  setResults([]);
                  setSearchError(null);
                }
              }}
              onFocus={() => {
                setIsListOpen(true);
              }}
              onBlur={() => {
                globalThis.setTimeout(() => {
                  setIsListOpen(false);
                }, 150);
              }}
              hasError={Boolean(errors.supplierProductId)}
              placeholder="Referencia, fabricante o producto"
              autoComplete="off"
              disabled={isSubmitting}
            />

            {isListOpen && query.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                {searchError && (
                  <p className="px-4 py-3 text-sm text-[var(--color-danger)]">{searchError}</p>
                )}

                {!searchError && results.length === 0 && (
                  <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados.</p>
                )}

                {!searchError && results.length > 0 && (
                  <ul className="max-h-64 overflow-y-auto">
                    {results.map((supplierProduct) => (
                      <li key={supplierProduct.id}>
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            selectSupplierProduct(supplierProduct);
                          }}
                          className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                        >
                          <span className="font-mono font-semibold text-foreground">
                            {supplierProduct.product_detail.standard_code}
                          </span>

                          <span className="ml-2 text-muted-foreground">
                            {supplierProduct.product_detail.name}
                          </span>

                          {supplierProduct.supplier_reference && (
                            <span className="ml-2 text-xs text-[var(--color-text-subtle)]">
                              Ref. {supplierProduct.supplier_reference}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="purchase-item-quantity" label="Cantidad" required error={errors.quantity}>
          <Input
            id="purchase-item-quantity"
            name="quantity"
            value={values.quantity}
            onChange={handleChange("quantity")}
            hasError={Boolean(errors.quantity)}
            inputMode="numeric"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>

        <Field id="purchase-item-unit-cost" label="Costo unitario" required error={errors.unitCost}>
          <Input
            id="purchase-item-unit-cost"
            name="unitCost"
            value={values.unitCost}
            onChange={handleChange("unitCost")}
            hasError={Boolean(errors.unitCost)}
            inputMode="decimal"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--color-border-soft)] pt-5">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button type="submit" isLoading={isSubmitting} loadingText={submittingLabel}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
