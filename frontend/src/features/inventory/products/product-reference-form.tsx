"use client";

import {
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

import type {
  ProductReferenceFormErrors,
  ProductReferenceFormField,
  ProductReferenceFormValues,
} from "./types";
import { validateProductReferenceForm } from "./reference-validation";

type ProductReferenceFormMode =
  | "create"
  | "edit";

type ProductReferenceFormProps = {
  mode: ProductReferenceFormMode;
  initialValues: ProductReferenceFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ProductReferenceFormErrors;
  onSubmit: (
    values: ProductReferenceFormValues,
  ) => void | Promise<void>;
  onCancel: () => void;
};

function mergeErrors(
  localErrors: ProductReferenceFormErrors,
  serverErrors: ProductReferenceFormErrors,
): ProductReferenceFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function ProductReferenceForm({
  mode,
  initialValues,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: ProductReferenceFormProps) {
  const formRef =
    useRef<HTMLFormElement>(null);

  const [values, setValues] =
    useState<ProductReferenceFormValues>(
      initialValues,
    );

  const [localErrors, setLocalErrors] =
    useState<ProductReferenceFormErrors>({});

  const errors = mergeErrors(
    localErrors,
    serverErrors,
  );

  function updateValue(
    field: ProductReferenceFormField,
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
      ProductReferenceFormField,
      "isActive"
    >,
  ) {
    return (
      event: ChangeEvent<
        HTMLInputElement |
        HTMLTextAreaElement
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
      validateProductReferenceForm(values);

    setLocalErrors(validationErrors);

    if (
      Object.keys(validationErrors).length > 0
    ) {
      const firstInvalidField =
        formRef.current?.querySelector<
          HTMLInputElement |
          HTMLTextAreaElement
        >("[aria-invalid='true']");

      firstInvalidField?.focus();
      return;
    }

    void onSubmit(values);
  }

  const submitLabel =
    mode === "create"
      ? "Agregar referencia"
      : "Guardar cambios";

  const submittingLabel =
    mode === "create"
      ? "Agregando referencia…"
      : "Guardando cambios…";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-5"
    >
      {submitError && (
        <FormError message={submitError} />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="reference-code"
          label="Código de referencia"
          required
          hint="Código comercial o equivalente del producto."
          error={errors.referenceCode}
        >
          <Input
            id="reference-code"
            name="referenceCode"
            value={values.referenceCode}
            onChange={handleTextChange(
              "referenceCode",
            )}
            hasError={
              Boolean(errors.referenceCode)
            }
            aria-describedby={[
              "reference-code-hint",
              errors.referenceCode
                ? "reference-code-error"
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            disabled={isSubmitting}
            autoFocus
          />
        </Field>

        <Field
          id="reference-manufacturer"
          label="Fabricante"
          hint="Puede dejarse vacío cuando no se conoce."
          error={errors.manufacturer}
        >
          <Input
            id="reference-manufacturer"
            name="manufacturer"
            value={values.manufacturer}
            onChange={handleTextChange(
              "manufacturer",
            )}
            hasError={
              Boolean(errors.manufacturer)
            }
            aria-describedby={[
              "reference-manufacturer-hint",
              errors.manufacturer
                ? "reference-manufacturer-error"
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
            maxLength={100}
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>
      </div>

      <Field
        id="reference-description"
        label="Descripción"
        hint="Información adicional para reconocer la equivalencia."
        error={errors.description}
      >
        <Textarea
          id="reference-description"
          name="description"
          value={values.description}
          onChange={handleTextChange(
            "description",
          )}
          hasError={
            Boolean(errors.description)
          }
          aria-describedby={[
            "reference-description-hint",
            errors.description
              ? "reference-description-error"
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
          maxLength={255}
          disabled={isSubmitting}
          className="min-h-24"
        />
      </Field>

      {mode === "edit" && (
        <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-3">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => {
              updateValue(
                "isActive",
                event.target.checked,
              );
            }}
            disabled={isSubmitting}
            className="mt-1 size-4 accent-[var(--color-primary)]"
          />

          <span>
            <span className="block text-sm font-semibold text-foreground">
              Referencia activa
            </span>

            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Las referencias inactivas se conservan para mantener trazabilidad.
            </span>
          </span>
        </label>
      )}

      <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--color-border-soft)] pt-5">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>

        <Button
          type="submit"
          isLoading={isSubmitting}
          loadingText={submittingLabel}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
