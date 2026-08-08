"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createImportCostCategory, getImportCostCategories } from "./api";
import { validateImportCostForm } from "./import-cost-validation";
import type {
  Currency,
  ImportCostCategory,
  ImportCostFormErrors,
  ImportCostFormField,
  ImportCostFormValues,
} from "./types";

type ImportCostFormMode = "create" | "edit";

type ImportCostFormProps = {
  mode: ImportCostFormMode;
  initialValues: ImportCostFormValues;
  purchaseCurrency: Currency;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ImportCostFormErrors;
  onSubmit: (values: ImportCostFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function mergeErrors(
  localErrors: ImportCostFormErrors,
  serverErrors: ImportCostFormErrors,
): ImportCostFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function ImportCostForm({
  mode,
  initialValues,
  purchaseCurrency,
  token,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: ImportCostFormProps) {
  const [values, setValues] = useState<ImportCostFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<ImportCostFormErrors>({});

  const [categories, setCategories] = useState<ImportCostCategory[]>([]);

  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");

  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const errors = mergeErrors(localErrors, serverErrors);

  useEffect(() => {
    const controller = new AbortController();

    getImportCostCategories(token, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        setCategories(result);
        setCategoriesError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCategoriesError("No fue posible cargar las categorías de costo.");
      });

    return () => {
      controller.abort();
    };
  }, [token]);

  function updateValue(field: ImportCostFormField, value: string | boolean): void {
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
    field: Exclude<ImportCostFormField, "isActive" | "currency" | "categoryId" | "exchangeRate">,
  ) {
    return (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      updateValue(field, event.target.value);
    };
  }

  async function handleCreateCategory(): Promise<void> {
    const trimmedName = newCategoryName.trim();

    if (!trimmedName) {
      setNewCategoryError("El nombre de la categoría es obligatorio.");
      return;
    }

    setIsCreatingCategory(true);
    setNewCategoryError(null);

    try {
      const category = await createImportCostCategory(token, {
        name: trimmedName,
        description: "",
      });

      setCategories((current) =>
        [...current, category].sort((left, right) =>
          left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
        ),
      );

      updateValue("categoryId", String(category.id));
      setNewCategoryName("");
      setIsNewCategoryOpen(false);
    } catch (error: unknown) {
      setNewCategoryError(
        error instanceof Error ? error.message : "No fue posible crear la categoría.",
      );
    } finally {
      setIsCreatingCategory(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateImportCostForm(values, purchaseCurrency);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    void onSubmit(values);
  }

  const submitLabel = mode === "create" ? "Agregar costo" : "Guardar cambios";

  const submittingLabel = mode === "create" ? "Agregando costo…" : "Guardando cambios…";

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {submitError && <FormError message={submitError} />}

      <Field id="import-cost-category" label="Categoría" required error={errors.categoryId}>
        <div className="flex gap-2">
          <select
            id="import-cost-category"
            value={values.categoryId}
            onChange={(event) => {
              updateValue("categoryId", event.target.value);
            }}
            disabled={isSubmitting}
            className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
          >
            <option value="">Seleccione…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setIsNewCategoryOpen((current) => !current);
              setNewCategoryError(null);
            }}
            disabled={isSubmitting}
          >
            Nueva
          </Button>
        </div>

        {categoriesError && <p className="mt-2 text-sm text-danger">{categoriesError}</p>}
      </Field>

      {isNewCategoryOpen && (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-3">
          {newCategoryError && <p className="mb-2 text-sm text-danger">{newCategoryError}</p>}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label
                htmlFor="new-import-cost-category"
                className="mb-1 block text-xs font-semibold text-foreground"
              >
                Nombre de la nueva categoría
              </label>

              <Input
                id="new-import-cost-category"
                value={newCategoryName}
                onChange={(event) => {
                  setNewCategoryName(event.target.value);
                }}
                maxLength={100}
                disabled={isCreatingCategory}
              />
            </div>

            <Button
              type="button"
              isLoading={isCreatingCategory}
              loadingText="Creando…"
              onClick={() => {
                void handleCreateCategory();
              }}
            >
              Crear
            </Button>
          </div>
        </div>
      )}

      <Field id="import-cost-description" label="Descripción" error={errors.description}>
        <Input
          id="import-cost-description"
          value={values.description}
          onChange={handleTextChange("description")}
          hasError={Boolean(errors.description)}
          maxLength={255}
          autoComplete="off"
          disabled={isSubmitting}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="import-cost-amount" label="Monto" required error={errors.amount}>
          <Input
            id="import-cost-amount"
            value={values.amount}
            onChange={handleTextChange("amount")}
            hasError={Boolean(errors.amount)}
            inputMode="decimal"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>

        <Field id="import-cost-currency" label="Moneda" required error={errors.currency}>
          <select
            id="import-cost-currency"
            value={values.currency}
            onChange={(event) => {
              const nextCurrency = event.target.value as Currency;

              updateValue("currency", nextCurrency);

              if (nextCurrency === purchaseCurrency) {
                updateValue("exchangeRate", "1");
              } else if (values.currency === purchaseCurrency) {
                // Traía el "1" por defecto de cuando coincidía con la moneda
                // de la compra: se limpia para obligar a escribir el tipo de cambio real.
                updateValue("exchangeRate", "");
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
          id="import-cost-exchange-rate"
          label="Tipo de cambio"
          required
          hint={
            values.currency === purchaseCurrency
              ? `La compra está en ${purchaseCurrency}, no requiere conversión.`
              : `Convierte el monto de ${values.currency} a ${purchaseCurrency}.`
          }
          error={errors.exchangeRate}
        >
          <Input
            id="import-cost-exchange-rate"
            value={values.exchangeRate}
            onChange={(event) => {
              updateValue("exchangeRate", event.target.value);
            }}
            hasError={Boolean(errors.exchangeRate)}
            inputMode="decimal"
            autoComplete="off"
            disabled={isSubmitting || values.currency === purchaseCurrency}
          />
        </Field>
      </div>

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
            <span className="block text-sm font-semibold text-foreground">Costo activo</span>

            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Los costos inactivos no se incluyen en el resumen ni en el cálculo de costos.
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
