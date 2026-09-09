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

import { searchActiveProducts } from "../suppliers/api";
import type { Product } from "../products/types";

import { validatePurchaseItemForm } from "./purchase-item-validation";
import type {
  PurchaseItemFormErrors,
  PurchaseItemFormField,
  PurchaseItemFormValues,
} from "./types";

type PurchaseItemFormMode = "create" | "edit";

type PurchaseItemFormProps = {
  mode: PurchaseItemFormMode;
  initialValues: PurchaseItemFormValues;
  productDisplayLabel?: string;
  canReadProducts: boolean;
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

function formatProductLabel(product: Product): string {
  return `${product.standard_code} — ${product.name}`;
}

export function PurchaseItemForm({
  mode,
  initialValues,
  productDisplayLabel,
  canReadProducts,
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
    mode === "edit" ? productDisplayLabel ?? null : null,
  );

  const [query, setQuery] = useState("");

  const [results, setResults] = useState<Product[]>([]);

  const [isListOpen, setIsListOpen] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  const errors = mergeErrors(localErrors, serverErrors);

  const effectiveSearchError = canReadProducts
    ? searchError
    : "No tiene permiso para buscar productos.";

  useEffect(() => {
    if (mode === "edit" || !canReadProducts) {
      return;
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      searchActiveProducts(token, trimmedQuery, controller.signal)
        .then((products) => {
          if (controller.signal.aborted) {
            return;
          }

          setResults(products);
          setSearchError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setSearchError("No fue posible buscar productos.");
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [mode, canReadProducts, query, token]);

  useEffect(() => {
    if (mode === "edit") {
      return;
    }

    const trimmedQuery = query.trim().toLowerCase();

    if (trimmedQuery.length === 0) {
      return;
    }

    const exactMatch = results.find(
      (product) => product.standard_code.trim().toLowerCase() === trimmedQuery,
    );

    if (exactMatch) {
      selectProduct(exactMatch);
    }
    // selectProduct se recrea en cada render; incluirla aqui
    // re-dispararia el efecto sin necesidad. Solo depende de mode/query/results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, query, results]);

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

  function handleChange(field: Exclude<PurchaseItemFormField, "productId">) {
    return (event: ChangeEvent<HTMLInputElement>): void => {
      updateValue(field, event.target.value);
    };
  }

  function selectProduct(product: Product): void {
    updateValue("productId", String(product.id));
    setSelectedLabel(formatProductLabel(product));
    setQuery("");
    setResults([]);
    setIsListOpen(false);
  }

  function clearSelected(): void {
    updateValue("productId", "");
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
        id="purchase-item-product"
        label="Producto"
        required
        hint={
          mode === "create"
            ? "Busque por código o nombre. Solo se muestran productos activos."
            : "El producto de la línea no puede modificarse; elimine la línea y cree una nueva si desea cambiarlo."
        }
        error={errors.productId}
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
              id="purchase-item-product"
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
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                }
              }}
              hasError={Boolean(errors.productId)}
              placeholder="Código o nombre del producto"
              autoComplete="off"
              disabled={isSubmitting}
            />

            {isListOpen && query.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                {effectiveSearchError && (
                  <p className="px-4 py-3 text-sm text-[var(--color-danger)]">{effectiveSearchError}</p>
                )}

                {!effectiveSearchError && results.length === 0 && (
                  <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados.</p>
                )}

                {!effectiveSearchError && results.length > 0 && (
                  <ul className="max-h-64 overflow-y-auto">
                    {results.map((product) => (
                      <li key={product.id}>
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            selectProduct(product);
                          }}
                          className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                        >
                          <span className="font-mono font-semibold text-foreground">
                            {product.standard_code}
                          </span>

                          <span className="ml-2 text-muted-foreground">
                            {product.name}
                          </span>
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
