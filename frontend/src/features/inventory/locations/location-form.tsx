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
  StorageLocationFormErrors,
  StorageLocationFormField,
  StorageLocationFormValues,
} from "./types";
import { validateStorageLocationForm } from "./validation";

type LocationFormMode =
  | "create"
  | "edit";

type LocationFormProps = {
  mode: LocationFormMode;
  initialValues: StorageLocationFormValues;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: StorageLocationFormErrors;
  onSubmit: (
    values: StorageLocationFormValues,
  ) => void | Promise<void>;
  onCancel: () => void;
};

function areValuesEqual(
  left: StorageLocationFormValues,
  right: StorageLocationFormValues,
): boolean {
  return (
    left.code === right.code &&
    left.description === right.description &&
    left.isActive === right.isActive
  );
}

function mergeErrors(
  localErrors: StorageLocationFormErrors,
  serverErrors: StorageLocationFormErrors,
): StorageLocationFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function LocationForm({
  mode,
  initialValues,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: LocationFormProps) {
  const formRef =
    useRef<HTMLFormElement>(null);

  const [values, setValues] =
    useState<StorageLocationFormValues>(
      initialValues,
    );

  const [localErrors, setLocalErrors] =
    useState<StorageLocationFormErrors>({});

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
    field: StorageLocationFormField,
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
      StorageLocationFormField,
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
      validateStorageLocationForm(values);

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
      ? "Crear ubicación"
      : "Guardar cambios";

  const submittingLabel =
    mode === "create"
      ? "Creando ubicación…"
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
            Información de la ubicación
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Registre el código operativo utilizado para identificar el espacio físico.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field
            id="location-code"
            label="Código"
            required
            hint="Formato: una letra y un número entre 1 y 9999. Ejemplo: A124."
            error={errors.code}
          >
            <Input
              id="location-code"
              name="code"
              value={values.code}
              onChange={(event) => {
                updateValue(
                  "code",
                  event.target.value.toUpperCase(),
                );
              }}
              hasError={Boolean(errors.code)}
              aria-describedby={[
                "location-code-hint",
                errors.code
                  ? "location-code-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={5}
              autoComplete="off"
              spellCheck={false}
              disabled={isSubmitting}
              autoFocus
            />
          </Field>

          <Field
            id="location-description"
            label="Descripción"
            hint="Detalle opcional para facilitar la identificación física."
            error={errors.description}
          >
            <Textarea
              id="location-description"
              name="description"
              value={values.description}
              onChange={handleTextChange(
                "description",
              )}
              hasError={
                Boolean(errors.description)
              }
              aria-describedby={[
                "location-description-hint",
                errors.description
                  ? "location-description-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              maxLength={255}
              disabled={isSubmitting}
            />
          </Field>
        </div>

        <div className="border-t border-[var(--color-border-soft)] p-5 sm:p-6">
        <label
            htmlFor="location-active"
            className="flex cursor-pointer items-start gap-3"
        >
            <input
            id="location-active"
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
            aria-invalid={
                errors.isActive ? true : undefined
            }
            aria-describedby={
                errors.isActive
                ? "location-active-error"
                : "location-active-description"
            }
            className="mt-0.5 size-5 rounded border-border accent-[var(--color-primary)]"
            />

            <span>
            <span className="block text-sm font-semibold text-foreground">
                Ubicación activa
            </span>

            <span
                id="location-active-description"
                className="mt-1 block text-xs leading-5 text-muted-foreground"
            >
                Las ubicaciones inactivas se conservan para mantener la trazabilidad, pero no pueden asignarse a productos nuevos.
            </span>

            {errors.isActive && (
                <span
                id="location-active-error"
                className="mt-2 block text-sm font-medium text-danger"
                role="alert"
                >
                {errors.isActive}
                </span>
            )}
            </span>
        </label>
        </div>
      </section>

      <section className="rounded-[var(--radius-xl)] bg-[var(--color-primary-soft)] p-5 ring-1 ring-[rgb(7_81_132_/_12%)] sm:p-6">
        <h2 className="text-sm font-semibold text-foreground">
          Regla de seguridad
        </h2>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Una ubicación que contenga productos activos no puede inactivarse. Primero debe trasladar o inactivar esos productos.
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
