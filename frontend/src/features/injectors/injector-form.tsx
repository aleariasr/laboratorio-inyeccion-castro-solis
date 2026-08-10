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

import { searchCustomers } from "../sales/api";
import type { CustomerSummary } from "../sales/types";

import type {
  InjectorFormErrors,
  InjectorFormField,
  InjectorFormValues,
} from "./types";
import { validateInjectorForm } from "./validation";

type InjectorFormMode = "create" | "edit";

type InjectorFormProps = {
  mode: InjectorFormMode;
  initialValues: InjectorFormValues;
  customerDisplayLabel?: string;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: InjectorFormErrors;
  onSubmit: (values: InjectorFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function areValuesEqual(
  left: InjectorFormValues,
  right: InjectorFormValues,
): boolean {
  return (
    left.customerId === right.customerId &&
    left.injectorNumber === right.injectorNumber &&
    left.description === right.description &&
    left.notes === right.notes &&
    left.isActive === right.isActive
  );
}

function mergeErrors(
  localErrors: InjectorFormErrors,
  serverErrors: InjectorFormErrors,
): InjectorFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function InjectorForm({
  mode,
  initialValues,
  customerDisplayLabel,
  token,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: InjectorFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<InjectorFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<InjectorFormErrors>({});

  const [selectedCustomerLabel, setSelectedCustomerLabel] = useState<string | null>(
    mode === "edit" ? customerDisplayLabel ?? null : null,
  );

  const [customerQuery, setCustomerQuery] = useState("");

  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);

  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);

  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);

  const isDirty = useMemo(
    () => !areValuesEqual(values, initialValues),
    [initialValues, values],
  );

  const errors = mergeErrors(localErrors, serverErrors);

  useEffect(() => {
    if (mode === "edit") {
      return;
    }

    const trimmedQuery = customerQuery.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      searchCustomers(token, trimmedQuery, controller.signal)
        .then((customers) => {
          if (controller.signal.aborted) {
            return;
          }

          setCustomerResults(customers);
          setCustomerSearchError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setCustomerSearchError("No fue posible buscar clientes.");
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [mode, customerQuery, token]);

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

  function updateValue(field: InjectorFormField, value: string | boolean): void {
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
    field: Exclude<InjectorFormField, "isActive" | "customerId">,
  ) {
    return (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      updateValue(field, event.target.value);
    };
  }

  function selectCustomer(customer: CustomerSummary): void {
    updateValue("customerId", String(customer.id));
    setSelectedCustomerLabel(customer.display_name);
    setCustomerQuery("");
    setCustomerResults([]);
    setIsCustomerListOpen(false);
  }

  function clearSelectedCustomer(): void {
    updateValue("customerId", "");
    setSelectedCustomerLabel(null);
    setCustomerQuery("");
    setCustomerResults([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateInjectorForm(values);

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

  const submitLabel = mode === "create" ? "Crear inyector" : "Guardar cambios";

  const submittingLabel =
    mode === "create" ? "Creando inyector…" : "Guardando cambios…";

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
            Datos del inyector
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Identificación del inyector y cliente propietario.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
          <Field
            id="injector-customer"
            label="Cliente"
            required
            hint={
              mode === "create"
                ? "Busque por nombre. Solo se muestran clientes activos."
                : "El cliente no puede modificarse una vez creado el inyector."
            }
            error={errors.customerId}
          >
            {mode === "edit" ? (
              <div className="flex h-12 items-center rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 text-sm font-medium text-foreground">
                {selectedCustomerLabel ?? "Cliente no disponible"}
              </div>
            ) : selectedCustomerLabel ? (
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">
                  {selectedCustomerLabel}
                </span>

                <button
                  type="button"
                  onClick={clearSelectedCustomer}
                  className="text-xs font-semibold text-primary hover:underline"
                  disabled={isSubmitting}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  id="injector-customer"
                  value={customerQuery}
                  onChange={(event) => {
                    const nextValue = event.target.value;

                    setCustomerQuery(nextValue);
                    setIsCustomerListOpen(true);

                    if (nextValue.trim().length < 2) {
                      setCustomerResults([]);
                      setCustomerSearchError(null);
                    }
                  }}
                  onFocus={() => {
                    setIsCustomerListOpen(true);
                  }}
                  onBlur={() => {
                    globalThis.setTimeout(() => {
                      setIsCustomerListOpen(false);
                    }, 150);
                  }}
                  hasError={Boolean(errors.customerId)}
                  placeholder="Nombre del cliente"
                  autoComplete="off"
                  disabled={isSubmitting}
                />

                {isCustomerListOpen && customerQuery.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                    {customerSearchError && (
                      <p className="px-4 py-3 text-sm text-[var(--color-danger)]">
                        {customerSearchError}
                      </p>
                    )}

                    {!customerSearchError && customerResults.length === 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">
                        Sin resultados.
                      </p>
                    )}

                    {!customerSearchError && customerResults.length > 0 && (
                      <ul className="max-h-64 overflow-y-auto">
                        {customerResults.map((customer) => (
                          <li key={customer.id}>
                            <button
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                selectCustomer(customer);
                              }}
                              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                            >
                              <span className="font-semibold text-foreground">
                                {customer.display_name}
                              </span>

                              {customer.identification && (
                                <span className="ml-2 text-xs text-[var(--color-text-subtle)]">
                                  {customer.identification}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </Field>

          <Field
            id="injector-number"
            label="Número de inyector"
            required
            error={errors.injectorNumber}
          >
            <Input
              id="injector-number"
              name="injectorNumber"
              value={values.injectorNumber}
              onChange={handleTextChange("injectorNumber")}
              hasError={Boolean(errors.injectorNumber)}
              maxLength={100}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </Field>

          <div className="lg:col-span-2">
            <Field
              id="injector-description"
              label="Descripción"
              hint="Marca, modelo u otra referencia útil."
              error={errors.description}
            >
              <Input
                id="injector-description"
                name="description"
                value={values.description}
                onChange={handleTextChange("description")}
                hasError={Boolean(errors.description)}
                maxLength={255}
                autoComplete="off"
                disabled={isSubmitting}
              />
            </Field>
          </div>

          <div className="lg:col-span-2">
            <Field id="injector-notes" label="Notas" error={errors.notes}>
              <Textarea
                id="injector-notes"
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
            htmlFor="injector-active"
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              id="injector-active"
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
                Inyector activo
              </span>

              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Los inyectores inactivos se conservan para trazabilidad, pero se ocultan del flujo habitual de servicios.
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
