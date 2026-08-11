"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import type {
  ServiceRecordTechnicalFormErrors,
  ServiceRecordTechnicalFormField,
  ServiceRecordTechnicalFormValues,
} from "./types";
import { validateServiceRecordTechnicalForm } from "./validation";

type ServiceTechnicalFormProps = {
  initialValues: ServiceRecordTechnicalFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ServiceRecordTechnicalFormErrors;
  onSubmit: (values: ServiceRecordTechnicalFormValues) => void | Promise<void>;
};

function mergeErrors(
  localErrors: ServiceRecordTechnicalFormErrors,
  serverErrors: ServiceRecordTechnicalFormErrors,
): ServiceRecordTechnicalFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function ServiceTechnicalForm({
  initialValues,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
}: ServiceTechnicalFormProps) {
  const [values, setValues] = useState<ServiceRecordTechnicalFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<ServiceRecordTechnicalFormErrors>({});

  const errors = mergeErrors(localErrors, serverErrors);

  function updateValue(field: ServiceRecordTechnicalFormField, value: string): void {
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

  function handleChange(field: ServiceRecordTechnicalFormField) {
    return (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      updateValue(field, event.target.value);
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateServiceRecordTechnicalForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    void onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {submitError && <FormError message={submitError} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="service-resistance"
          label="Resistencia"
          hint="Ohmios."
          error={errors.resistance}
        >
          <Input
            id="service-resistance"
            value={values.resistance}
            onChange={handleChange("resistance")}
            hasError={Boolean(errors.resistance)}
            inputMode="decimal"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>

        <Field
          id="service-leakage"
          label="Fuga"
          hint="Mililitros u otra unidad estándar del laboratorio."
          error={errors.leakage}
        >
          <Input
            id="service-leakage"
            value={values.leakage}
            onChange={handleChange("leakage")}
            hasError={Boolean(errors.leakage)}
            inputMode="decimal"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>
      </div>

      <Field id="service-notes-before" label="Notas antes del servicio" error={errors.notesBefore}>
        <Textarea
          id="service-notes-before"
          value={values.notesBefore}
          onChange={handleChange("notesBefore")}
          hasError={Boolean(errors.notesBefore)}
          disabled={isSubmitting}
        />
      </Field>

      <Field id="service-notes-after" label="Notas después del servicio" error={errors.notesAfter}>
        <Textarea
          id="service-notes-after"
          value={values.notesAfter}
          onChange={handleChange("notesAfter")}
          hasError={Boolean(errors.notesAfter)}
          disabled={isSubmitting}
        />
      </Field>

      <Field id="service-observations" label="Observaciones internas" error={errors.observations}>
        <Textarea
          id="service-observations"
          value={values.observations}
          onChange={handleChange("observations")}
          hasError={Boolean(errors.observations)}
          disabled={isSubmitting}
        />
      </Field>

      <div className="flex justify-end border-t border-[var(--color-border-soft)] pt-5">
        <Button type="submit" isLoading={isSubmitting} loadingText="Guardando…">
          Guardar datos técnicos
        </Button>
      </div>
    </form>
  );
}
