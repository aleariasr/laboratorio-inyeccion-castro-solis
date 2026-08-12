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

import { formatMoney } from "../inventory/purchases/format";
import { getProducts } from "../inventory/products/api";
import type { Product } from "../inventory/products/types";
import { getLatestProductCostHistory } from "./api";
import { validateSaleItemForm } from "./sale-item-validation";
import type {
  ProductCostHistory,
  SaleItemFormErrors,
  SaleItemFormField,
  SaleItemFormValues,
} from "./types";

type SaleItemFormMode = "create" | "edit";

type SaleItemFormProps = {
  mode: SaleItemFormMode;
  initialValues: SaleItemFormValues;
  productDisplayLabel?: string;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: SaleItemFormErrors;
  onSubmit: (values: SaleItemFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function mergeErrors(
  localErrors: SaleItemFormErrors,
  serverErrors: SaleItemFormErrors,
): SaleItemFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

function formatProductLabel(product: Product): string {
  return `${product.standard_code} — ${product.name}`;
}

export function SaleItemForm({
  mode,
  initialValues,
  productDisplayLabel,
  token,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: SaleItemFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<SaleItemFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<SaleItemFormErrors>({});

  const [selectedLabel, setSelectedLabel] = useState<string | null>(
    mode === "edit" ? productDisplayLabel ?? null : null,
  );

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [query, setQuery] = useState("");

  const [results, setResults] = useState<Product[]>([]);

  const [isListOpen, setIsListOpen] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  const [priceReference, setPriceReference] = useState<ProductCostHistory | null>(null);

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
      getProducts(
        token,
        {
          query: trimmedQuery,
          activeState: "active",
          page: 1,
          pageSize: 20,
        },
        controller.signal,
      )
        .then((response) => {
          if (controller.signal.aborted) {
            return;
          }

          setResults(response.results);
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
  }, [mode, query, token]);

  useEffect(() => {
    if (!selectedProduct) {
      return;
    }

    const controller = new AbortController();

    getLatestProductCostHistory(token, selectedProduct.id, controller.signal)
      .then((history) => {
        if (controller.signal.aborted) {
          return;
        }

        setPriceReference(history);
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        setPriceReference(null);
      });

    return () => {
      controller.abort();
    };
  }, [selectedProduct, token]);

  function updateValue(field: SaleItemFormField, value: string): void {
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

  function handleChange(field: Exclude<SaleItemFormField, "productId">) {
    return (event: ChangeEvent<HTMLInputElement>): void => {
      updateValue(field, event.target.value);
    };
  }

  function selectProduct(product: Product): void {
    updateValue("productId", String(product.id));
    setSelectedLabel(formatProductLabel(product));
    setSelectedProduct(product);
    setPriceReference(null);
    setQuery("");
    setResults([]);
    setIsListOpen(false);
  }

  function clearSelected(): void {
    updateValue("productId", "");
    setSelectedLabel(null);
    setSelectedProduct(null);
    setPriceReference(null);
    setQuery("");
    setResults([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateSaleItemForm(
      values,
      selectedProduct?.current_stock,
    );

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

  const priceReferenceHint = (() => {
    if (!priceReference || !priceReference.suggested_price) {
      return undefined;
    }

    const suggestedCrc =
      priceReference.currency === "USD"
        ? Number(priceReference.suggested_price) * Number(priceReference.exchange_rate)
        : Number(priceReference.suggested_price);

    if (!Number.isFinite(suggestedCrc)) {
      return undefined;
    }

    return `Referencia: último precio sugerido ₡${formatMoney(suggestedCrc)} (compra del ${priceReference.calculated_at.slice(0, 10)}).`;
  })();

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-5"
    >
      {submitError && <FormError message={submitError} />}

      <Field
        id="sale-item-product"
        label="Producto"
        required
        hint={
          mode === "create"
            ? "Busque por código o nombre. Solo productos activos."
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
            <div>
              <span className="text-sm font-medium text-foreground">{selectedLabel}</span>

              {selectedProduct && (
                <span className="ml-2 text-xs text-muted-foreground">
                  Disponible: {selectedProduct.current_stock}
                </span>
              )}
            </div>

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
              id="sale-item-product"
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
              hasError={Boolean(errors.productId)}
              placeholder="Código o nombre del producto"
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

                          <span className="ml-2 text-muted-foreground">{product.name}</span>

                          <span className="ml-2 text-xs text-[var(--color-text-subtle)]">
                            Disponible: {product.current_stock}
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
        <Field id="sale-item-quantity" label="Cantidad" required error={errors.quantity}>
          <Input
            id="sale-item-quantity"
            name="quantity"
            value={values.quantity}
            onChange={handleChange("quantity")}
            hasError={Boolean(errors.quantity)}
            inputMode="numeric"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>

        <Field
          id="sale-item-unit-price"
          label="Precio unitario"
          required
          hint={priceReferenceHint}
          error={errors.unitPrice}
        >
          <Input
            id="sale-item-unit-price"
            name="unitPrice"
            value={values.unitPrice}
            onChange={handleChange("unitPrice")}
            hasError={Boolean(errors.unitPrice)}
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
