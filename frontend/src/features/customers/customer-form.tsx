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
  CustomerFormErrors,
  CustomerFormField,
  CustomerFormValues,
} from "./types";
import { validateCustomerForm } from "./validation";

type CustomerFormMode = "create" | "edit";

type CustomerFormProps = {
  mode: CustomerFormMode;
  initialValues: CustomerFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: CustomerFormErrors;
  onSubmit: (values: CustomerFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function areValuesEqual(
  left: CustomerFormValues,
  right: CustomerFormValues,
): boolean {
  return (
    left.customerType === right.customerType &&
    left.displayName === right.displayName &&
    left.phone === right.phone &&
    left.email === right.email &&
    left.identification === right.identification &&
    left.notes === right.notes &&
    left.isActive === right.isActive
  );
}

function mergeErrors(
  localErrors: CustomerFormErrors,
  serverErrors: CustomerFormErrors,
): CustomerFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function CustomerForm({
  mode,
  initialValues,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: CustomerFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<CustomerFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<CustomerFormErrors>({});

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

  function updateValue(field: CustomerFormField, value: string | boolean): void {
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
    field: Exclude<CustomerFormField, "isActive" | "customerType">,
  ) {
    return (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      updateValue(field, event.target.value);
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateCustomerForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const firstInvalidField = formRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[aria-invalid='true']");

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

  const submitLabel = mode === "create" ? "Crear cliente" : "Guardar cambios";

  const submittingLabel =
    mode === "create" ? "Creando cliente…" : "Guardando cambios…";

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
            Información del cliente
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Datos generales para identificar al cliente en ventas y servicios.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field
            id="customer-type"
            label="Tipo de cliente"
            required
            error={errors.customerType}
          >
            <Select
              id="customer-type"
              name="customerType"
              value={values.customerType}
              onChange={(event) => {
                updateValue("customerType", event.target.value);
              }}
              hasError={Boolean(errors.customerType)}
              disabled={isSubmitting}
            >
              <option value="PERSON">Persona</option>
              <option value="COMPANY">Empresa</option>
            </Select>
          </Field>

          <Field
            id="customer-display-name"
            label="Nombre"
            required
            hint="Nombre completo o razón social."
            error={errors.displayName}
          >
            <Input
              id="customer-display-name"
              name="displayName"
              value={values.displayName}
              onChange={handleTextChange("displayName")}
              hasError={Boolean(errors.displayName)}
              maxLength={150}
              autoComplete="off"
              disabled={isSubmitting}
              autoFocus
            />
          </Field>

          <Field
            id="customer-identification"
            label="Identificación"
            hint="Cédula física, jurídica o DIMEX."
            error={errors.identification}
          >
            <Input
              id="customer-identification"
              name="identification"
              value={values.identification}
              onChange={handleTextChange("identification")}
              hasError={Boolean(errors.identification)}
              maxLength={50}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <Field id="customer-phone" label="Teléfono" error={errors.phone}>
            <Input
              id="customer-phone"
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
            id="customer-email"
            label="Correo electrónico"
            error={errors.email}
          >
            <Input
              id="customer-email"
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

          <div className="lg:col-span-2">
            <Field id="customer-notes" label="Notas" error={errors.notes}>
              <Textarea
                id="customer-notes"
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
            htmlFor="customer-active"
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              id="customer-active"
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
                Cliente activo
              </span>

              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Los clientes inactivos se conservan para trazabilidad, pero se ocultan del flujo habitual de ventas.
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
