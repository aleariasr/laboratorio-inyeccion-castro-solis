"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { getInjectors } from "../injectors/api";
import type { Injector } from "../injectors/types";

import type {
  ServiceRecordCreateFormErrors,
  ServiceRecordCreateFormValues,
} from "./types";
import { validateServiceRecordCreateForm } from "./validation";

type ServiceRecordCreateFormProps = {
  initialValues: ServiceRecordCreateFormValues;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ServiceRecordCreateFormErrors;
  onSubmit: (values: ServiceRecordCreateFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function mergeErrors(
  localErrors: ServiceRecordCreateFormErrors,
  serverErrors: ServiceRecordCreateFormErrors,
): ServiceRecordCreateFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

function formatInjectorLabel(injector: Injector): string {
  return `${injector.injector_number} — ${injector.customer_detail.display_name}`;
}

export function ServiceRecordCreateForm({
  initialValues,
  token,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: ServiceRecordCreateFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<ServiceRecordCreateFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<ServiceRecordCreateFormErrors>({});

  const [selectedInjectorLabel, setSelectedInjectorLabel] = useState<string | null>(null);

  const [query, setQuery] = useState("");

  const [results, setResults] = useState<Injector[]>([]);

  const [isListOpen, setIsListOpen] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  const errors = mergeErrors(localErrors, serverErrors);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      getInjectors(
        token,
        {
          query: trimmedQuery,
          activeState: "active",
          page: 1,
          pageSize: 20,
        },
        controller.signal,
      )
        .then((response) => {
          if (controller.signal.aborted) {
            return;
          }

          setResults(response.results);
          setSearchError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setSearchError("No fue posible buscar inyectores.");
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, token]);

  function updateValue(
    field: keyof ServiceRecordCreateFormValues,
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

  function selectInjector(injector: Injector): void {
    updateValue("injectorId", String(injector.id));
    setSelectedInjectorLabel(formatInjectorLabel(injector));
    setQuery("");
    setResults([]);
    setIsListOpen(false);
  }

  function clearSelected(): void {
    updateValue("injectorId", "");
    setSelectedInjectorLabel(null);
    setQuery("");
    setResults([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateServiceRecordCreateForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const firstInvalidField = formRef.current?.querySelector<HTMLInputElement>("[aria-invalid='true']");

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
      className="grid gap-6"
    >
      {submitError && <FormError message={submitError} />}

      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Recepción de inyector
          </h2>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Registre la entrada de un inyector para revisión.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6">
          <Field
            id="service-injector"
            label="Inyector"
            required
            hint="Busque por número de inyector o nombre del cliente."
            error={errors.injectorId}
          >
            {selectedInjectorLabel ? (
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">
                  {selectedInjectorLabel}
                </span>

                <button
                  type="button"
                  onClick={clearSelected}
                  className="text-xs font-semibold text-primary hover:underline"
                  disabled={isSubmitting}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  id="service-injector"
                  value={query}
                  onChange={(event) => {
                    const nextValue = event.target.value;

                    setQuery(nextValue);
                    setIsListOpen(true);

                    if (nextValue.trim().length < 2) {
                      setResults([]);
                      setSearchError(null);
                    }
                  }}
                  onFocus={() => {
                    setIsListOpen(true);
                  }}
                  onBlur={() => {
                    globalThis.setTimeout(() => {
                      setIsListOpen(false);
                    }, 150);
                  }}
                  hasError={Boolean(errors.injectorId)}
                  placeholder="Número de inyector o cliente"
                  autoComplete="off"
                  disabled={isSubmitting}
                />

                {isListOpen && query.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                    {searchError && (
                      <p className="px-4 py-3 text-sm text-[var(--color-danger)]">{searchError}</p>
                    )}

                    {!searchError && results.length === 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados.</p>
                    )}

                    {!searchError && results.length > 0 && (
                      <ul className="max-h-64 overflow-y-auto">
                        {results.map((injector) => (
                          <li key={injector.id}>
                            <button
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                selectInjector(injector);
                              }}
                              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                            >
                              <span className="font-mono font-semibold text-foreground">
                                {injector.injector_number}
                              </span>

                              <span className="ml-2 text-muted-foreground">
                                {injector.customer_detail.display_name}
                              </span>
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
            id="service-received-at"
            label="Fecha y hora de recepción"
            required
            error={errors.receivedAt}
          >
            <Input
              id="service-received-at"
              name="receivedAt"
              type="datetime-local"
              value={values.receivedAt}
              onChange={(event) => {
                updateValue("receivedAt", event.target.value);
              }}
              hasError={Boolean(errors.receivedAt)}
              disabled={isSubmitting}
            />
          </Field>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 rounded-[var(--radius-xl)] bg-surface p-4 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button type="submit" isLoading={isSubmitting} loadingText="Recibiendo…">
          Recibir inyector
        </Button>
      </div>
    </form>
  );
}
