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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  VARIANT_KIND_OPTIONS,
  type Product,
  type ProductVariantFormErrors,
  type ProductVariantFormField,
  type ProductVariantFormValues,
} from "./types";
import { validateProductVariantForm } from "./validation";

type ProductVariantFormProps = {
  parent: Product;
  initialValues: ProductVariantFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ProductVariantFormErrors;
  onSubmit: (
    values: ProductVariantFormValues,
  ) => void | Promise<void>;
  onCancel: () => void;
};

function mergeErrors(
  localErrors: ProductVariantFormErrors,
  serverErrors: ProductVariantFormErrors,
): ProductVariantFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function ProductVariantForm({
  parent,
  initialValues,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: ProductVariantFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] =
    useState<ProductVariantFormValues>(initialValues);

  const [localErrors, setLocalErrors] =
    useState<ProductVariantFormErrors>({});

  const errors = mergeErrors(localErrors, serverErrors);

  function updateValue(
    field: ProductVariantFormField,
    value: string,
  ): void {
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

  function handleTextChange(field: ProductVariantFormField) {
    return (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ): void => {
      updateValue(field, event.target.value);
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateProductVariantForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const firstInvalidField =
        formRef.current?.querySelector<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >("[aria-invalid='true']");

      firstInvalidField?.focus();
      return;
    }

    void onSubmit(values);
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-4 rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] p-4 ring-1 ring-[rgb(7_81_132_/_12%)] sm:p-5"
    >
      {submitError && <FormError message={submitError} />}

      <p className="text-sm leading-6 text-muted-foreground">
        Esta variante hereda el código estándar (
        <strong className="text-foreground">
          {parent.standard_code}
        </strong>
        ) y la ubicación (
        <strong className="text-foreground">
          {parent.storage_location_detail.code}
        </strong>
        ) del producto original — no se pueden cambiar aquí.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="variant-name"
          label="Nombre"
          required
          error={errors.name}
        >
          <Input
            id="variant-name"
            name="name"
            value={values.name}
            onChange={handleTextChange("name")}
            hasError={Boolean(errors.name)}
            maxLength={150}
            autoComplete="off"
            disabled={isSubmitting}
            autoFocus
          />
        </Field>

        <Field
          id="variant-kind"
          label="Tipo de variante"
          required
          error={errors.variantKind}
        >
          <Select
            id="variant-kind"
            name="variantKind"
            value={values.variantKind}
            onChange={handleTextChange("variantKind")}
            hasError={Boolean(errors.variantKind)}
            disabled={isSubmitting}
          >
            {VARIANT_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="variant-unit-of-measure"
          label="Unidad de medida"
          hint={`Vacío = usar "${parent.unit_of_measure}", igual que el producto original.`}
          error={errors.unitOfMeasure}
        >
          <Input
            id="variant-unit-of-measure"
            name="unitOfMeasure"
            value={values.unitOfMeasure}
            onChange={handleTextChange("unitOfMeasure")}
            hasError={Boolean(errors.unitOfMeasure)}
            maxLength={20}
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>

        <Field
          id="variant-custom-sale-price"
          label="Precio de venta"
          hint="Opcional — puede definirlo después."
          error={errors.customSalePrice}
        >
          <Input
            id="variant-custom-sale-price"
            name="customSalePrice"
            value={values.customSalePrice}
            onChange={handleTextChange("customSalePrice")}
            hasError={Boolean(errors.customSalePrice)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Sin precio todavía"
            disabled={isSubmitting}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            id="variant-description"
            label="Descripción"
            error={errors.description}
          >
            <Textarea
              id="variant-description"
              name="description"
              value={values.description}
              onChange={handleTextChange("description")}
              hasError={Boolean(errors.description)}
              disabled={isSubmitting}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
          loadingText="Creando variante…"
        >
          Crear variante
        </Button>
      </div>
    </form>
  );
}
