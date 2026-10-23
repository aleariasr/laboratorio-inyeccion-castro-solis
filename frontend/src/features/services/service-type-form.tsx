"use client";

import { useRef, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
};

// En una página, cada sección es una tarjeta (24 px, con sombra). Dentro
// de una ventana (embedded), que ya es la tarjeta, las secciones son
// paneles internos: 18 px y sin sombra, como el resto de la escala.
const SECTION_CLASSES =
  "overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]";

const EMBEDDED_SECTION_CLASSES =
  "overflow-hidden rounded-[var(--radius-lg)] bg-surface ring-1 ring-[var(--color-border-soft)]";

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
}: ServiceTypeFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const sectionClasses = embedded ? EMBEDDED_SECTION_CLASSES : SECTION_CLASSES;

  const [values, setValues] = useState<ServiceTypeFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<ServiceTypeFormErrors>({});

  const errors = { ...serverErrors, ...localErrors };

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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button
          type="submit"
          isLoading={isSubmitting}
          loadingText={mode === "create" ? "Creando…" : "Guardando…"}
        >
          {mode === "create" ? "Crear tipo de servicio" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
