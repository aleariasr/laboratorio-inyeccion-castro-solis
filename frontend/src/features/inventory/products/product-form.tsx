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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type {
  ProductFormErrors,
  ProductFormField,
  ProductFormValues,
  StorageLocationSummary,
} from "./types";
import { validateProductForm } from "./validation";

type ProductFormMode =
  | "create"
  | "edit";

type ProductFormProps = {
  mode: ProductFormMode;
  initialValues: ProductFormValues;
  locations: StorageLocationSummary[];
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ProductFormErrors;
  onSubmit: (
    values: ProductFormValues,
  ) => void | Promise<void>;
  onCancel: () => void;
};

function areValuesEqual(
  left: ProductFormValues,
  right: ProductFormValues,
): boolean {
  return (
    left.standardCode === right.standardCode &&
    left.name === right.name &&
    left.description === right.description &&
    left.storageLocationId ===
      right.storageLocationId &&
    left.minimumStock === right.minimumStock &&
    left.unitOfMeasure === right.unitOfMeasure &&
    left.isActive === right.isActive
  );
}

function mergeErrors(
  localErrors: ProductFormErrors,
  serverErrors: ProductFormErrors,
): ProductFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function ProductForm({
  mode,
  initialValues,
  locations,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const formRef =
    useRef<HTMLFormElement>(null);

  const [values, setValues] =
    useState<ProductFormValues>(
      initialValues,
    );

  const [localErrors, setLocalErrors] =
    useState<ProductFormErrors>({});

  const isDirty = useMemo(
    () => !areValuesEqual(values, initialValues),
    [initialValues, values],
  );

  const errors = mergeErrors(
    localErrors,
    serverErrors,
  );

  useEffect(() => {
    function handleBeforeUnload(
      event: BeforeUnloadEvent,
    ): void {
      if (!isDirty || isSubmitting) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    globalThis.addEventListener(
      "beforeunload",
      handleBeforeUnload,
    );

    return () => {
      globalThis.removeEventListener(
        "beforeunload",
        handleBeforeUnload,
      );
    };
  }, [
    isDirty,
    isSubmitting,
  ]);

  useEffect(() => {
    function handleSaveShortcut(
      event: KeyboardEvent,
    ): void {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();

        if (!isSubmitting) {
          formRef.current?.requestSubmit();
        }
      }
    }

    globalThis.addEventListener(
      "keydown",
      handleSaveShortcut,
    );

    return () => {
      globalThis.removeEventListener(
        "keydown",
        handleSaveShortcut,
      );
    };
  }, [isSubmitting]);

  function updateValue(
    field: ProductFormField,
    value: string | boolean,
  ): void {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));

    setLocalErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = {
        ...current,
      };

      delete nextErrors[field];

      return nextErrors;
    });
  }

  function handleTextChange(
    field: Exclude<
      ProductFormField,
      "isActive"
    >,
  ) {
    return (
      event: ChangeEvent<
        HTMLInputElement |
        HTMLTextAreaElement |
        HTMLSelectElement
      >,
    ): void => {
      updateValue(
        field,
        event.target.value,
      );
    };
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();

    const validationErrors =
      validateProductForm(values);

    setLocalErrors(validationErrors);

    if (
      Object.keys(validationErrors).length > 0
    ) {
      const firstInvalidField =
        formRef.current?.querySelector<
          HTMLInputElement |
          HTMLTextAreaElement |
          HTMLSelectElement
        >("[aria-invalid='true']");

      firstInvalidField?.focus();
      return;
    }

    void onSubmit(values);
  }

  function handleCancel(): void {
    if (
      isDirty &&
      !globalThis.confirm(
        "Hay cambios sin guardar. ¿Desea salir y descartarlos?",
      )
    ) {
      return;
    }

    onCancel();
  }

  const submitLabel =
    mode === "create"
      ? "Crear producto"
      : "Guardar cambios";

  const submittingLabel =
    mode === "create"
      ? "Creando producto…"
      : "Guardando cambios…";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-6"
    >
      {submitError && (
        <FormError message={submitError} />
      )}

      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Información del producto
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Registre la identificación y descripción de la pieza.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field
            id="standard-code"
            label="Código estándar"
            required
            hint="Código principal utilizado para identificar la pieza."
            error={errors.standardCode}
          >
            <Input
              id="standard-code"
              name="standardCode"
              value={values.standardCode}
              onChange={handleTextChange(
                "standardCode",
              )}
              hasError={
                Boolean(errors.standardCode)
              }
              aria-describedby={[
                "standard-code-hint",
                errors.standardCode
                  ? "standard-code-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={50}
              autoComplete="off"
              spellCheck={false}
              disabled={isSubmitting}
              autoFocus
            />
          </Field>

          <Field
            id="product-name"
            label="Nombre"
            required
            hint="Nombre corto y reconocible del producto."
            error={errors.name}
          >
            <Input
              id="product-name"
              name="name"
              value={values.name}
              onChange={handleTextChange(
                "name",
              )}
              hasError={Boolean(errors.name)}
              aria-describedby={[
                "product-name-hint",
                errors.name
                  ? "product-name-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={150}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <div className="lg:col-span-2">
            <Field
              id="product-description"
              label="Descripción"
              hint="Información adicional para distinguir la pieza."
              error={errors.description}
            >
              <Textarea
                id="product-description"
                name="description"
                value={values.description}
                onChange={handleTextChange(
                  "description",
                )}
                hasError={
                  Boolean(errors.description)
                }
                aria-describedby={[
                  "product-description-hint",
                  errors.description
                    ? "product-description-error"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={isSubmitting}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Inventario y ubicación
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Defina dónde se almacena la pieza y cuándo debe considerarse bajo mínimo.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-3">
          <Field
            id="storage-location"
            label="Ubicación"
            required
            hint="Solo se muestran ubicaciones activas."
            error={errors.storageLocationId}
          >
            <Select
              id="storage-location"
              name="storageLocationId"
              value={
                values.storageLocationId
              }
              onChange={handleTextChange(
                "storageLocationId",
              )}
              hasError={
                    Boolean(errors.storageLocationId)
                }
              aria-describedby={[
                "storage-location-hint",
                errors.storageLocationId
                  ? "storage-location-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={isSubmitting}
            >
              <option value="">
                Seleccione una ubicación
              </option>

              {locations.map((location) => (
                <option
                  key={location.id}
                  value={location.id}
                >
                  {location.code}
                  {location.description
                    ? ` — ${location.description}`
                    : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="minimum-stock"
            label="Stock mínimo"
            required
            hint="Cantidad mínima antes de generar una advertencia."
            error={errors.minimumStock}
          >
            <Input
              id="minimum-stock"
              name="minimumStock"
              type="number"
              value={values.minimumStock}
              onChange={handleTextChange(
                "minimumStock",
              )}
              hasError={
                Boolean(errors.minimumStock)
              }
              aria-describedby={[
                "minimum-stock-hint",
                errors.minimumStock
                  ? "minimum-stock-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              min={0}
              step={1}
              inputMode="numeric"
              disabled={isSubmitting}
            />
          </Field>

          <Field
            id="unit-of-measure"
            label="Unidad de medida"
            required
            hint="Ejemplos: unidad, kit, juego."
            error={errors.unitOfMeasure}
          >
            <Input
              id="unit-of-measure"
              name="unitOfMeasure"
              value={values.unitOfMeasure}
              onChange={handleTextChange(
                "unitOfMeasure",
              )}
              hasError={
                Boolean(errors.unitOfMeasure)
              }
              aria-describedby={[
                "unit-of-measure-hint",
                errors.unitOfMeasure
                  ? "unit-of-measure-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={20}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>
        </div>

        <div className="border-t border-[var(--color-border-soft)] p-5 sm:p-6">
          <label
            htmlFor="product-active"
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              id="product-active"
              name="isActive"
              type="checkbox"
              checked={values.isActive}
              onChange={(event) => {
                updateValue(
                  "isActive",
                  event.target.checked,
                );
              }}
              disabled={isSubmitting}
              className="mt-0.5 size-5 rounded border-border accent-[var(--color-primary)]"
            />

            <span>
              <span className="block text-sm font-semibold text-foreground">
                Producto activo
              </span>

              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Los productos inactivos se conservan para mantener la trazabilidad, pero pueden ocultarse de la operación habitual.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-[var(--radius-xl)] bg-[var(--color-primary-soft)] p-5 ring-1 ring-[rgb(7_81_132_/_12%)] sm:p-6">
        <h2 className="text-sm font-semibold text-foreground">
          Existencias protegidas
        </h2>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          La existencia actual no se modifica desde este formulario. Todo cambio de stock debe registrarse mediante entradas, salidas, ajustes o conteos físicos.
        </p>
      </section>

      <div className="flex flex-col-reverse gap-3 rounded-[var(--radius-xl)] bg-surface p-4 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {isDirty
            ? "Hay cambios pendientes de guardar."
            : "No hay cambios pendientes."}
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

          <Button
            type="submit"
            isLoading={isSubmitting}
            loadingText={submittingLabel}
          >
            <span>{submitLabel}</span>

            {!isSubmitting && (
              <KeyboardShortcut
                keys={["Ctrl", "S"]}
              />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
