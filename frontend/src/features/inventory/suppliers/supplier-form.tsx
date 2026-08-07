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
  SupplierFormErrors,
  SupplierFormField,
  SupplierFormValues,
} from "./types";
import { validateSupplierForm } from "./validation";

type SupplierFormMode = "create" | "edit";

type SupplierFormProps = {
  mode: SupplierFormMode;
  initialValues: SupplierFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: SupplierFormErrors;
  onSubmit: (values: SupplierFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function areValuesEqual(
  left: SupplierFormValues,
  right: SupplierFormValues,
): boolean {
  return (
    left.name === right.name &&
    left.contactName === right.contactName &&
    left.phone === right.phone &&
    left.email === right.email &&
    left.country === right.country &&
    left.notes === right.notes &&
    left.isActive === right.isActive
  );
}

function mergeErrors(
  localErrors: SupplierFormErrors,
  serverErrors: SupplierFormErrors,
): SupplierFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function SupplierForm({
  mode,
  initialValues,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: SupplierFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<SupplierFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<SupplierFormErrors>({});

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

  function updateValue(field: SupplierFormField, value: string | boolean): void {
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

  function handleTextChange(field: Exclude<SupplierFormField, "isActive">) {
    return (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      updateValue(field, event.target.value);
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateSupplierForm(values);

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

  const submitLabel = mode === "create" ? "Crear proveedor" : "Guardar cambios";

  const submittingLabel =
    mode === "create" ? "Creando proveedor…" : "Guardando cambios…";

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
            Información del proveedor
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Datos generales de la empresa que suministra productos.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field
            id="supplier-name"
            label="Nombre"
            required
            hint="Nombre de la empresa proveedora."
            error={errors.name}
          >
            <Input
              id="supplier-name"
              name="name"
              value={values.name}
              onChange={handleTextChange("name")}
              hasError={Boolean(errors.name)}
              aria-describedby={[
                "supplier-name-hint",
                errors.name ? "supplier-name-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={150}
              autoComplete="off"
              disabled={isSubmitting}
              autoFocus
            />
          </Field>

          <Field
            id="supplier-country"
            label="País"
            hint="País donde opera el proveedor."
            error={errors.country}
          >
            <Input
              id="supplier-country"
              name="country"
              value={values.country}
              onChange={handleTextChange("country")}
              hasError={Boolean(errors.country)}
              aria-describedby={[
                "supplier-country-hint",
                errors.country ? "supplier-country-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={100}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <div className="lg:col-span-2">
            <Field
              id="supplier-notes"
              label="Notas"
              hint="Información adicional relevante para compras."
              error={errors.notes}
            >
              <Textarea
                id="supplier-notes"
                name="notes"
                value={values.notes}
                onChange={handleTextChange("notes")}
                hasError={Boolean(errors.notes)}
                aria-describedby={[
                  "supplier-notes-hint",
                  errors.notes ? "supplier-notes-error" : null,
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
            Contacto
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Persona y medios de contacto para gestionar compras.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-3">
          <Field
            id="supplier-contact-name"
            label="Nombre de contacto"
            error={errors.contactName}
          >
            <Input
              id="supplier-contact-name"
              name="contactName"
              value={values.contactName}
              onChange={handleTextChange("contactName")}
              hasError={Boolean(errors.contactName)}
              maxLength={150}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <Field
            id="supplier-phone"
            label="Teléfono"
            error={errors.phone}
          >
            <Input
              id="supplier-phone"
              name="phone"
              value={values.phone}
              onChange={handleTextChange("phone")}
              hasError={Boolean(errors.phone)}
              maxLength={30}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <Field
            id="supplier-email"
            label="Correo electrónico"
            error={errors.email}
          >
            <Input
              id="supplier-email"
              name="email"
              type="email"
              value={values.email}
              onChange={handleTextChange("email")}
              hasError={Boolean(errors.email)}
              maxLength={254}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>
        </div>

        <div className="border-t border-[var(--color-border-soft)] p-5 sm:p-6">
          <label
            htmlFor="supplier-active"
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              id="supplier-active"
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
                Proveedor activo
              </span>

              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Los proveedores inactivos se conservan para trazabilidad, pero se ocultan del flujo habitual de compras.
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
