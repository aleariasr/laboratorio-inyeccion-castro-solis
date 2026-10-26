"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { formActionsClassName, formSectionClassName } from "@/components/forms/form-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";
import { Textarea } from "@/components/ui/textarea";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";
import { isFormShortcutTarget } from "@/lib/dom/form-shortcuts";

import type {
  ServiceTypeFormErrors,
  ServiceTypeFormField,
  ServiceTypeFormValues,
} from "./types";
import { validateServiceTypeForm } from "./validation";

type ServiceTypeFormProps = {
  mode: "create" | "edit";
  initialValues: ServiceTypeFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ServiceTypeFormErrors;
  onSubmit: (values: ServiceTypeFormValues) => void | Promise<void>;
  onCancel: () => void;
  // Dentro de una ventana (Dialog): secciones como paneles internos.
  embedded?: boolean;
  // Avisa si hay cambios sin guardar: la ventana pregunta antes de
  // descartarlos al cerrarla con Esc o la × (punto 7).
  onDirtyChange?: (isDirty: boolean) => void;
};

function areValuesEqual(left: ServiceTypeFormValues, right: ServiceTypeFormValues): boolean {
  return (
    left.name === right.name &&
    left.description === right.description &&
    left.defaultLaborPrice === right.defaultLaborPrice &&
    left.isActive === right.isActive
  );
}

/**
 * Tipo de servicio completo (punto 1A del plan del 2026-10-22): nombre,
 * precio de mano de obra y qué incluye. Los accesorios no van aquí: se
 * agregan en cada servicio con lo que de verdad se usó.
 */
export function ServiceTypeForm({
  mode,
  initialValues,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
  embedded = false,
  onDirtyChange,
}: ServiceTypeFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const sectionClasses = formSectionClassName(embedded);

  const [values, setValues] = useState<ServiceTypeFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<ServiceTypeFormErrors>({});

  const errors = { ...serverErrors, ...localErrors };

  const isDirty = useMemo(
    () => !areValuesEqual(values, initialValues),
    [initialValues, values],
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();

        if (!isSubmitting && isFormShortcutTarget(formRef.current)) {
          formRef.current?.requestSubmit();
        }
      }
    }

    globalThis.addEventListener("keydown", handleSaveShortcut);

    return () => {
      globalThis.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [isSubmitting]);

  function handleCancel(): void {
    if (
      isDirty &&
      !confirmWithFocusRestore("Hay cambios sin guardar. ¿Desea salir y descartarlos?")
    ) {
      return;
    }

    onCancel();
  }

  function clearError(field: ServiceTypeFormField): void {
    setLocalErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  function updateValue<FieldName extends ServiceTypeFormField>(
    field: FieldName,
    value: ServiceTypeFormValues[FieldName],
  ): void {
    setValues((current) => ({ ...current, [field]: value }));
    clearError(field);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateServiceTypeForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      formRef.current
        ?.querySelector<HTMLElement>("[aria-invalid='true']")
        ?.focus();
      return;
    }

    void onSubmit(values);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-6">
      {submitError && <FormError message={submitError} />}

      <section className={sectionClasses}>
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Servicio
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            El precio de mano de obra se propone al cobrar; en cada servicio se puede cambiar.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field id="service-type-name" label="Nombre" required error={errors.name}>
            <Input
              id="service-type-name"
              value={values.name}
              onChange={(event) => {
                updateValue("name", event.target.value);
              }}
              hasError={Boolean(errors.name)}
              maxLength={150}
              autoComplete="off"
              disabled={isSubmitting}
              autoFocus
            />
          </Field>

          <Field
            id="service-type-labor-price"
            label="Precio de mano de obra"
            hint="Opcional. Sin precio, se escribe en cada servicio."
            error={errors.defaultLaborPrice}
          >
            <Input
              id="service-type-labor-price"
              value={values.defaultLaborPrice}
              onChange={(event) => {
                updateValue("defaultLaborPrice", event.target.value);
              }}
              hasError={Boolean(errors.defaultLaborPrice)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Sin precio definido"
              disabled={isSubmitting}
            />
          </Field>

          <div className="lg:col-span-2">
            <Field
              id="service-type-description"
              label="Qué incluye"
              hint="Descripción del servicio, por ejemplo los pasos o las pruebas que comprende."
              error={errors.description}
            >
              <Textarea
                id="service-type-description"
                value={values.description}
                onChange={(event) => {
                  updateValue("description", event.target.value);
                }}
                hasError={Boolean(errors.description)}
                disabled={isSubmitting}
              />
            </Field>
          </div>
        </div>
      </section>

      {mode === "edit" && (
        <section className={sectionClasses}>
          <div className="p-5 sm:p-6">
            <label htmlFor="service-type-active" className="flex cursor-pointer items-start gap-3">
              <input
                id="service-type-active"
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
                  Tipo de servicio activo
                </span>

                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Los inactivos no aparecen para elegir en servicios nuevos; los servicios que ya
                  lo usan lo conservan.
                </span>
              </span>
            </label>
          </div>
        </section>
      )}

      <div className={formActionsClassName(embedded)}>
        {!embedded && (
          <div className="text-xs text-muted-foreground">
            {isDirty ? "Hay cambios pendientes de guardar." : "No hay cambios pendientes."}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSubmitting}>
            Cancelar
          </Button>

          <Button
            type="submit"
            isLoading={isSubmitting}
            loadingText={mode === "create" ? "Creando…" : "Guardando…"}
          >
            <span>{mode === "create" ? "Crear tipo de servicio" : "Guardar cambios"}</span>

            {!isSubmitting && <KeyboardShortcut keys={["Ctrl", "S"]} />}
          </Button>
        </div>
      </div>
    </form>
  );
}
