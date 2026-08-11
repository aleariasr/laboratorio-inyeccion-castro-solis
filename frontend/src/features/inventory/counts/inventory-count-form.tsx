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

import type {
  InventoryCountFormErrors,
  InventoryCountFormField,
  InventoryCountFormValues,
} from "./types";
import { validateInventoryCountForm } from "./validation";

type InventoryCountFormMode = "create" | "edit";

type InventoryCountFormProps = {
  mode: InventoryCountFormMode;
  initialValues: InventoryCountFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: InventoryCountFormErrors;
  onSubmit: (values: InventoryCountFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function areValuesEqual(
  left: InventoryCountFormValues,
  right: InventoryCountFormValues,
): boolean {
  return (
    left.reference === right.reference &&
    left.countDate === right.countDate &&
    left.notes === right.notes &&
    left.isActive === right.isActive
  );
}

function mergeErrors(
  localErrors: InventoryCountFormErrors,
  serverErrors: InventoryCountFormErrors,
): InventoryCountFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function InventoryCountForm({
  mode,
  initialValues,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: InventoryCountFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<InventoryCountFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<InventoryCountFormErrors>({});

  const isDirty = useMemo(
    () => !areValuesEqual(values, initialValues),
    [initialValues, values],
  );

  const errors = mergeErrors(localErrors, serverErrors);

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

  function updateValue(field: InventoryCountFormField, value: string | boolean): void {
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

  function handleTextChange(field: Exclude<InventoryCountFormField, "isActive">) {
    return (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      updateValue(field, event.target.value);
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateInventoryCountForm(values);

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

  const submitLabel = mode === "create" ? "Crear conteo" : "Guardar cambios";

  const submittingLabel =
    mode === "create" ? "Creando conteo…" : "Guardando cambios…";

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
            Datos del conteo
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Identifique el conteo físico y su fecha de referencia.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field
            id="inventory-count-reference"
            label="Referencia"
            required
            hint="Identificador único del conteo, por ejemplo CF-2026-01."
            error={errors.reference}
          >
            <Input
              id="inventory-count-reference"
              name="reference"
              value={values.reference}
              onChange={handleTextChange("reference")}
              hasError={Boolean(errors.reference)}
              maxLength={50}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <Field
            id="inventory-count-date"
            label="Fecha del conteo"
            required
            error={errors.countDate}
          >
            <Input
              id="inventory-count-date"
              name="countDate"
              type="date"
              value={values.countDate}
              onChange={handleTextChange("countDate")}
              hasError={Boolean(errors.countDate)}
              disabled={isSubmitting}
            />
          </Field>

          <div className="lg:col-span-2">
            <Field id="inventory-count-notes" label="Notas" error={errors.notes}>
              <Textarea
                id="inventory-count-notes"
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
            htmlFor="inventory-count-active"
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              id="inventory-count-active"
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
                Conteo activo
              </span>

              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Los conteos inactivos se conservan para trazabilidad, pero se ocultan del flujo habitual.
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
