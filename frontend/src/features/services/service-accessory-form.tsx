"use client";

import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createAccessory, getAccessories } from "./api";
import { validateServiceAccessoryForm } from "./validation";
import type {
  Accessory,
  ServiceAccessoryFormErrors,
  ServiceAccessoryFormValues,
} from "./types";

type ServiceAccessoryFormMode = "create" | "edit";

type ServiceAccessoryFormProps = {
  mode: ServiceAccessoryFormMode;
  initialValues: ServiceAccessoryFormValues;
  accessoryDisplayLabel?: string;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ServiceAccessoryFormErrors;
  onSubmit: (values: ServiceAccessoryFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function mergeErrors(
  localErrors: ServiceAccessoryFormErrors,
  serverErrors: ServiceAccessoryFormErrors,
): ServiceAccessoryFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function ServiceAccessoryForm({
  mode,
  initialValues,
  accessoryDisplayLabel,
  token,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: ServiceAccessoryFormProps) {
  const [values, setValues] = useState<ServiceAccessoryFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<ServiceAccessoryFormErrors>({});

  const [accessories, setAccessories] = useState<Accessory[]>([]);

  const [accessoriesError, setAccessoriesError] = useState<string | null>(null);

  const [isNewAccessoryOpen, setIsNewAccessoryOpen] = useState(false);

  const [newAccessoryName, setNewAccessoryName] = useState("");

  const [newAccessoryError, setNewAccessoryError] = useState<string | null>(null);

  const [isCreatingAccessory, setIsCreatingAccessory] = useState(false);

  const errors = mergeErrors(localErrors, serverErrors);

  useEffect(() => {
    if (mode === "edit") {
      return;
    }

    const controller = new AbortController();

    getAccessories(token, "", controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        setAccessories(result);
        setAccessoriesError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setAccessoriesError("No fue posible cargar los accesorios.");
      });

    return () => {
      controller.abort();
    };
  }, [mode, token]);

  function updateValue(field: keyof ServiceAccessoryFormValues, value: string): void {
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

  async function handleCreateAccessory(): Promise<void> {
    const trimmedName = newAccessoryName.trim();

    if (!trimmedName) {
      setNewAccessoryError("El nombre del accesorio es obligatorio.");
      return;
    }

    setIsCreatingAccessory(true);
    setNewAccessoryError(null);

    try {
      const accessory = await createAccessory(token, {
        name: trimmedName,
        description: "",
      });

      setAccessories((current) =>
        [...current, accessory].sort((left, right) =>
          left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
        ),
      );

      updateValue("accessoryId", String(accessory.id));
      setNewAccessoryName("");
      setIsNewAccessoryOpen(false);
    } catch (error: unknown) {
      setNewAccessoryError(
        error instanceof Error ? error.message : "No fue posible crear el accesorio.",
      );
    } finally {
      setIsCreatingAccessory(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateServiceAccessoryForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    void onSubmit(values);
  }

  const submitLabel = mode === "create" ? "Agregar accesorio" : "Guardar cambios";

  const submittingLabel = mode === "create" ? "Agregando…" : "Guardando…";

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {submitError && <FormError message={submitError} />}

      <Field id="service-accessory-item" label="Accesorio" required error={errors.accessoryId}>
        {mode === "edit" ? (
          <div className="flex h-11 items-center rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 text-sm font-medium text-foreground">
            {accessoryDisplayLabel ?? "Accesorio no disponible"}
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <select
                id="service-accessory-item"
                value={values.accessoryId}
                onChange={(event) => {
                  updateValue("accessoryId", event.target.value);
                }}
                disabled={isSubmitting}
                className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
              >
                <option value="">Seleccione…</option>
                {accessories.map((accessory) => (
                  <option key={accessory.id} value={accessory.id}>
                    {accessory.name}
                  </option>
                ))}
              </select>

              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsNewAccessoryOpen((current) => !current);
                  setNewAccessoryError(null);
                }}
                disabled={isSubmitting}
              >
                Nuevo
              </Button>
            </div>

            {accessoriesError && <p className="mt-2 text-sm text-danger">{accessoriesError}</p>}
          </>
        )}
      </Field>

      {isNewAccessoryOpen && mode === "create" && (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-3">
          {newAccessoryError && <p className="mb-2 text-sm text-danger">{newAccessoryError}</p>}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label
                htmlFor="new-service-accessory"
                className="mb-1 block text-xs font-semibold text-foreground"
              >
                Nombre del nuevo accesorio
              </label>

              <Input
                id="new-service-accessory"
                value={newAccessoryName}
                onChange={(event) => {
                  setNewAccessoryName(event.target.value);
                }}
                maxLength={100}
                disabled={isCreatingAccessory}
              />
            </div>

            <Button
              type="button"
              isLoading={isCreatingAccessory}
              loadingText="Creando…"
              onClick={() => {
                void handleCreateAccessory();
              }}
            >
              Crear
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="service-accessory-quantity" label="Cantidad" required error={errors.quantity}>
          <Input
            id="service-accessory-quantity"
            value={values.quantity}
            onChange={(event) => {
              updateValue("quantity", event.target.value);
            }}
            hasError={Boolean(errors.quantity)}
            inputMode="numeric"
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>

        <Field id="service-accessory-notes" label="Notas" error={errors.notes}>
          <Input
            id="service-accessory-notes"
            value={values.notes}
            onChange={(event) => {
              updateValue("notes", event.target.value);
            }}
            hasError={Boolean(errors.notes)}
            autoComplete="off"
            disabled={isSubmitting}
          />
        </Field>
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--color-border-soft)] pt-5">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button type="submit" isLoading={isSubmitting} loadingText={submittingLabel}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
