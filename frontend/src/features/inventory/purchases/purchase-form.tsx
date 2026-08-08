"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";
import { Textarea } from "@/components/ui/textarea";

import { getSuppliers } from "../suppliers/api";
import type { Supplier } from "../suppliers/types";

import type {
  PurchaseFormErrors,
  PurchaseFormField,
  PurchaseFormValues,
} from "./types";
import { validatePurchaseForm } from "./validation";

type PurchaseFormMode = "create" | "edit";

type PurchaseFormProps = {
  mode: PurchaseFormMode;
  initialValues: PurchaseFormValues;
  supplierDisplayLabel?: string;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: PurchaseFormErrors;
  onSubmit: (values: PurchaseFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function areValuesEqual(
  left: PurchaseFormValues,
  right: PurchaseFormValues,
): boolean {
  return (
    left.supplierId === right.supplierId &&
    left.invoiceNumber === right.invoiceNumber &&
    left.purchaseDate === right.purchaseDate &&
    left.currency === right.currency &&
    left.exchangeRate === right.exchangeRate &&
    left.notes === right.notes &&
    left.isActive === right.isActive
  );
}

function mergeErrors(
  localErrors: PurchaseFormErrors,
  serverErrors: PurchaseFormErrors,
): PurchaseFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function PurchaseForm({
  mode,
  initialValues,
  supplierDisplayLabel,
  token,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: PurchaseFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<PurchaseFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<PurchaseFormErrors>({});

  const [selectedSupplierLabel, setSelectedSupplierLabel] = useState<string | null>(
    mode === "edit" ? supplierDisplayLabel ?? null : null,
  );

  const [supplierQuery, setSupplierQuery] = useState("");

  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);

  const [isSupplierListOpen, setIsSupplierListOpen] = useState(false);

  const [supplierSearchError, setSupplierSearchError] = useState<string | null>(null);

  const isDirty = useMemo(
    () => !areValuesEqual(values, initialValues),
    [initialValues, values],
  );

  const errors = mergeErrors(localErrors, serverErrors);

  useEffect(() => {
    if (mode === "edit") {
      return;
    }

    const trimmedQuery = supplierQuery.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      getSuppliers(
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

          setSupplierResults(response.results);
          setSupplierSearchError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setSupplierSearchError("No fue posible buscar proveedores.");
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [mode, supplierQuery, token]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (!isDirty || isSubmitting) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    globalThis.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      globalThis.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, isSubmitting]);

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();

        if (!isSubmitting) {
          formRef.current?.requestSubmit();
        }
      }
    }

    globalThis.addEventListener("keydown", handleSaveShortcut);

    return () => {
      globalThis.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [isSubmitting]);

  function updateValue(field: PurchaseFormField, value: string | boolean): void {
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
    field: Exclude<PurchaseFormField, "isActive" | "supplierId" | "currency">,
  ) {
    return (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      updateValue(field, event.target.value);
    };
  }

  function selectSupplier(supplier: Supplier): void {
    updateValue("supplierId", String(supplier.id));
    setSelectedSupplierLabel(supplier.name);
    setSupplierQuery("");
    setSupplierResults([]);
    setIsSupplierListOpen(false);
  }

  function clearSelectedSupplier(): void {
    updateValue("supplierId", "");
    setSelectedSupplierLabel(null);
    setSupplierQuery("");
    setSupplierResults([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validatePurchaseForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const firstInvalidField = formRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>("[aria-invalid='true']");

      firstInvalidField?.focus();
      return;
    }

    void onSubmit(values);
  }

  function handleCancel(): void {
    if (
      isDirty &&
      !globalThis.confirm("Hay cambios sin guardar. ¿Desea salir y descartarlos?")
    ) {
      return;
    }

    onCancel();
  }

  const submitLabel = mode === "create" ? "Crear compra" : "Guardar cambios";

  const submittingLabel =
    mode === "create" ? "Creando compra…" : "Guardando cambios…";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-6"
    >
      {submitError && <FormError message={submitError} />}

      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Datos de la compra
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Información de la factura del proveedor.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field
            id="purchase-supplier"
            label="Proveedor"
            required
            hint={
              mode === "create"
                ? "Busque por nombre. Solo se muestran proveedores activos."
                : "El proveedor no puede modificarse una vez creada la compra."
            }
            error={errors.supplierId}
          >
            {mode === "edit" ? (
              <div className="flex h-12 items-center rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 text-sm font-medium text-foreground">
                {selectedSupplierLabel ?? "Proveedor no disponible"}
              </div>
            ) : selectedSupplierLabel ? (
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">
                  {selectedSupplierLabel}
                </span>

                <button
                  type="button"
                  onClick={clearSelectedSupplier}
                  className="text-xs font-semibold text-primary hover:underline"
                  disabled={isSubmitting}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  id="purchase-supplier"
                  value={supplierQuery}
                  onChange={(event) => {
                    const nextValue = event.target.value;

                    setSupplierQuery(nextValue);
                    setIsSupplierListOpen(true);

                    if (nextValue.trim().length < 2) {
                      setSupplierResults([]);
                      setSupplierSearchError(null);
                    }
                  }}
                  onFocus={() => {
                    setIsSupplierListOpen(true);
                  }}
                  onBlur={() => {
                    globalThis.setTimeout(() => {
                      setIsSupplierListOpen(false);
                    }, 150);
                  }}
                  hasError={Boolean(errors.supplierId)}
                  placeholder="Nombre del proveedor"
                  autoComplete="off"
                  disabled={isSubmitting}
                />

                {isSupplierListOpen && supplierQuery.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                    {supplierSearchError && (
                      <p className="px-4 py-3 text-sm text-[var(--color-danger)]">
                        {supplierSearchError}
                      </p>
                    )}

                    {!supplierSearchError && supplierResults.length === 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">
                        Sin resultados.
                      </p>
                    )}

                    {!supplierSearchError && supplierResults.length > 0 && (
                      <ul className="max-h-64 overflow-y-auto">
                        {supplierResults.map((supplier) => (
                          <li key={supplier.id}>
                            <button
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                selectSupplier(supplier);
                              }}
                              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                            >
                              <span className="font-semibold text-foreground">
                                {supplier.name}
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

          <Field
            id="purchase-invoice-number"
            label="Número de factura"
            required
            error={errors.invoiceNumber}
          >
            <Input
              id="purchase-invoice-number"
              name="invoiceNumber"
              value={values.invoiceNumber}
              onChange={handleTextChange("invoiceNumber")}
              hasError={Boolean(errors.invoiceNumber)}
              maxLength={100}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <Field
            id="purchase-date"
            label="Fecha de compra"
            required
            error={errors.purchaseDate}
          >
            <Input
              id="purchase-date"
              name="purchaseDate"
              type="date"
              value={values.purchaseDate}
              onChange={handleTextChange("purchaseDate")}
              hasError={Boolean(errors.purchaseDate)}
              disabled={isSubmitting}
            />
          </Field>

          <Field
            id="purchase-currency"
            label="Moneda"
            required
            error={errors.currency}
          >
            <select
              id="purchase-currency"
              name="currency"
              value={values.currency}
              onChange={(event) => {
                const nextCurrency = event.target.value;

                updateValue("currency", nextCurrency);

                if (nextCurrency === "CRC") {
                  updateValue("exchangeRate", "1");
                }
              }}
              disabled={isSubmitting}
              className="h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
            >
              <option value="CRC">Colones (CRC)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </Field>

          <Field
            id="purchase-exchange-rate"
            label="Tipo de cambio"
            required
            hint={
              values.currency === "CRC"
                ? "No aplica: la compra ya está en colones."
                : "Colones por dólar (₡ por US$1)."
            }
            error={errors.exchangeRate}
          >
            <Input
              id="purchase-exchange-rate"
              name="exchangeRate"
              value={values.exchangeRate}
              onChange={handleTextChange("exchangeRate")}
              hasError={Boolean(errors.exchangeRate)}
              inputMode="decimal"
              autoComplete="off"
              disabled={isSubmitting || values.currency === "CRC"}
            />
          </Field>

          <div className="lg:col-span-2">
            <Field id="purchase-notes" label="Notas" error={errors.notes}>
              <Textarea
                id="purchase-notes"
                name="notes"
                value={values.notes}
                onChange={handleTextChange("notes")}
                hasError={Boolean(errors.notes)}
                disabled={isSubmitting}
              />
            </Field>
          </div>
        </div>

        <div className="border-t border-[var(--color-border-soft)] p-5 sm:p-6">
          <label
            htmlFor="purchase-active"
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              id="purchase-active"
              name="isActive"
              type="checkbox"
              checked={values.isActive}
              onChange={(event) => {
                updateValue("isActive", event.target.checked);
              }}
              disabled={isSubmitting}
              className="mt-0.5 size-5 rounded border-border accent-[var(--color-primary)]"
            />

            <span>
              <span className="block text-sm font-semibold text-foreground">
                Compra activa
              </span>

              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Las compras inactivas se conservan para trazabilidad, pero se ocultan del flujo habitual.
              </span>
            </span>
          </label>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 rounded-[var(--radius-xl)] bg-surface p-4 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {isDirty ? "Hay cambios pendientes de guardar." : "No hay cambios pendientes."}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>

          <Button type="submit" isLoading={isSubmitting} loadingText={submittingLabel}>
            <span>{submitLabel}</span>

            {!isSubmitting && <KeyboardShortcut keys={["Ctrl", "S"]} />}
          </Button>
        </div>
      </div>
    </form>
  );
}
