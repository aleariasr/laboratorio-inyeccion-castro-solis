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
import { Textarea } from "@/components/ui/textarea";

import type { Product } from "../products/types";

import { searchActiveProducts } from "./api";
import { validateSupplierProductForm } from "./supplier-product-validation";
import type {
  SupplierProductFormErrors,
  SupplierProductFormField,
  SupplierProductFormValues,
} from "./types";

type SupplierProductFormMode = "create" | "edit";

type SupplierProductFormProps = {
  mode: SupplierProductFormMode;
  initialValues: SupplierProductFormValues;
  productDisplayLabel?: string;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: SupplierProductFormErrors;
  onSubmit: (values: SupplierProductFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function mergeErrors(
  localErrors: SupplierProductFormErrors,
  serverErrors: SupplierProductFormErrors,
): SupplierProductFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

function formatProductLabel(product: Product): string {
  return `${product.standard_code} — ${product.name}`;
}

export function SupplierProductForm({
  mode,
  initialValues,
  productDisplayLabel,
  token,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: SupplierProductFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<SupplierProductFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<SupplierProductFormErrors>({});

  const [selectedProductLabel, setSelectedProductLabel] = useState<string | null>(
    mode === "edit" ? productDisplayLabel ?? null : null,
  );

  const [productQuery, setProductQuery] = useState("");

  const [productResults, setProductResults] = useState<Product[]>([]);

  const [isProductListOpen, setIsProductListOpen] = useState(false);

  const [productSearchError, setProductSearchError] = useState<string | null>(null);

  const errors = mergeErrors(localErrors, serverErrors);

  useEffect(() => {
    if (mode === "edit") {
      return;
    }

    const trimmedQuery = productQuery.trim();

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

          setProductResults(products);
          setProductSearchError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setProductSearchError("No fue posible buscar productos.");
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [mode, productQuery, token]);

  function updateValue(field: SupplierProductFormField, value: string | boolean): void {
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

  function handleTextChange(
    field: Exclude<SupplierProductFormField, "preferredSupplier" | "isActive" | "productId">,
  ) {
    return (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      updateValue(field, event.target.value);
    };
  }

  function selectProduct(product: Product): void {
    updateValue("productId", String(product.id));
    setSelectedProductLabel(formatProductLabel(product));
    setProductQuery("");
    setProductResults([]);
    setIsProductListOpen(false);
  }

  function clearSelectedProduct(): void {
    updateValue("productId", "");
    setSelectedProductLabel(null);
    setProductQuery("");
    setProductResults([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateSupplierProductForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const firstInvalidField = formRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>("[aria-invalid='true']");

      firstInvalidField?.focus();
      return;
    }

    void onSubmit(values);
  }

  const submitLabel = mode === "create" ? "Asociar producto" : "Guardar cambios";

  const submittingLabel = mode === "create" ? "Asociando producto…" : "Guardando cambios…";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-5"
    >
      {submitError && <FormError message={submitError} />}

      <Field
        id="supplier-product-product"
        label="Producto"
        required
        hint={
          mode === "create"
            ? "Busque por código o nombre. Solo se muestran productos activos."
            : "El producto asociado no puede modificarse; cree un nuevo registro si desea asociar otro producto."
        }
        error={errors.productId}
      >
        {mode === "edit" ? (
          <div className="flex h-11 items-center rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 text-sm font-medium text-foreground">
            {selectedProductLabel ?? "Producto no disponible"}
          </div>
        ) : selectedProductLabel ? (
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">
              {selectedProductLabel}
            </span>

            <button
              type="button"
              onClick={clearSelectedProduct}
              className="text-xs font-semibold text-primary hover:underline"
              disabled={isSubmitting}
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="relative">
            <Input
              id="supplier-product-product"
              value={productQuery}
              onChange={(event) => {
                const nextValue = event.target.value;

                setProductQuery(nextValue);
                setIsProductListOpen(true);

                if (nextValue.trim().length < 2) {
                  setProductResults([]);
                  setProductSearchError(null);
                }
              }}
              onFocus={() => {
                setIsProductListOpen(true);
              }}
              onBlur={() => {
                globalThis.setTimeout(() => {
                  setIsProductListOpen(false);
                }, 150);
              }}
              hasError={Boolean(errors.productId)}
              placeholder="Código o nombre del producto"
              autoComplete="off"
              disabled={isSubmitting}
            />

            {isProductListOpen && productQuery.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                {productSearchError && (
                  <p className="px-4 py-3 text-sm text-[var(--color-danger)]">
                    {productSearchError}
                  </p>
                )}

                {!productSearchError && productResults.length === 0 && (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    Sin resultados.
                  </p>
                )}

                {!productSearchError && productResults.length > 0 && (
                  <ul className="max-h-64 overflow-y-auto">
                    {productResults.map((product) => (
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
        <Field
          id="supplier-product-reference"
          label="Referencia del proveedor"
          hint="Código que usa el proveedor para identificar la pieza."
          error={errors.supplierReference}
        >
          <Input
            id="supplier-product-reference"
            name="supplierReference"
            value={values.supplierReference}
            onChange={handleTextChange("supplierReference")}
            hasError={Boolean(errors.supplierReference)}
            maxLength={80}
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>

        <Field
          id="supplier-product-manufacturer"
          label="Fabricante"
          hint="Marca con la que el proveedor comercializa la pieza."
          error={errors.manufacturer}
        >
          <Input
            id="supplier-product-manufacturer"
            name="manufacturer"
            value={values.manufacturer}
            onChange={handleTextChange("manufacturer")}
            hasError={Boolean(errors.manufacturer)}
            maxLength={100}
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>
      </div>

      <Field id="supplier-product-notes" label="Notas" error={errors.notes}>
        <Textarea
          id="supplier-product-notes"
          name="notes"
          value={values.notes}
          onChange={handleTextChange("notes")}
          hasError={Boolean(errors.notes)}
          disabled={isSubmitting}
          className="min-h-24"
        />
      </Field>

      <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-3">
        <input
          type="checkbox"
          checked={values.preferredSupplier}
          onChange={(event) => {
            updateValue("preferredSupplier", event.target.checked);
          }}
          disabled={isSubmitting}
          className="mt-1 size-4 accent-[var(--color-primary)]"
        />

        <span>
          <span className="block text-sm font-semibold text-foreground">
            Proveedor preferido para este producto
          </span>

          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            Se usará como referencia principal al planificar compras de esta pieza.
          </span>
        </span>
      </label>

      {mode === "edit" && (
        <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-3">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => {
              updateValue("isActive", event.target.checked);
            }}
            disabled={isSubmitting}
            className="mt-1 size-4 accent-[var(--color-primary)]"
          />

          <span>
            <span className="block text-sm font-semibold text-foreground">
              Asociación activa
            </span>

            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Las asociaciones inactivas se conservan para mantener trazabilidad.
            </span>
          </span>
        </label>
      )}

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
