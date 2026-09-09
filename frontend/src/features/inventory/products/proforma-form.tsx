"use client";

import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { searchCustomers } from "../../sales/api";
import type { CustomerSummary } from "../../sales/types";

type ProformaFormProps = {
  canReadCustomers: boolean;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  onSubmit: (customerId: number | null) => void | Promise<void>;
  onCancel: () => void;
};

export function ProformaForm({
  canReadCustomers,
  token,
  isSubmitting = false,
  submitError = null,
  onSubmit,
  onCancel,
}: ProformaFormProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  const [selectedCustomerLabel, setSelectedCustomerLabel] = useState<string | null>(null);

  const [customerQuery, setCustomerQuery] = useState("");

  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);

  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);

  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);

  const effectiveCustomerSearchError = canReadCustomers
    ? customerSearchError
    : "No tiene permiso para buscar clientes.";

  useEffect(() => {
    if (!canReadCustomers) {
      return;
    }

    const trimmedQuery = customerQuery.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      searchCustomers(token, trimmedQuery, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) {
            return;
          }

          setCustomerResults(results);
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
  }, [canReadCustomers, customerQuery, token]);

  function selectCustomer(customer: CustomerSummary): void {
    setSelectedCustomerId(customer.id);
    setSelectedCustomerLabel(customer.display_name);
    setCustomerQuery("");
    setCustomerResults([]);
    setIsCustomerListOpen(false);
  }

  function clearSelectedCustomer(): void {
    setSelectedCustomerId(null);
    setSelectedCustomerLabel(null);
    setCustomerQuery("");
    setCustomerResults([]);
  }

  function handleQueryChange(value: string): void {
    setCustomerQuery(value);
    setIsCustomerListOpen(true);

    if (value.trim().length < 2) {
      setCustomerResults([]);
      setCustomerSearchError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    void onSubmit(selectedCustomerId);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {submitError && <FormError message={submitError} />}

      <Field
        id="proforma-customer"
        label="Cliente"
        hint="Opcional. Busque por nombre, identificación o teléfono, o déjelo vacío para no incluir datos de cliente."
      >
        {selectedCustomerLabel ? (
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
              id="proforma-customer"
              value={customerQuery}
              onChange={(event) => {
                handleQueryChange(event.target.value);
              }}
              onFocus={() => {
                setIsCustomerListOpen(true);
              }}
              onBlur={() => {
                globalThis.setTimeout(() => {
                  setIsCustomerListOpen(false);
                }, 150);
              }}
              placeholder="Nombre, identificación o teléfono (opcional)"
              autoComplete="off"
              disabled={isSubmitting}
            />

            {isCustomerListOpen && customerQuery.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                {effectiveCustomerSearchError && (
                  <p className="px-4 py-3 text-sm text-[var(--color-danger)]">
                    {effectiveCustomerSearchError}
                  </p>
                )}

                {!effectiveCustomerSearchError && customerResults.length === 0 && (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    Sin resultados.
                  </p>
                )}

                {!effectiveCustomerSearchError && customerResults.length > 0 && (
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

                          {customer.phone && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {customer.phone}
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

      <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--color-border-soft)] pt-5">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button type="submit" isLoading={isSubmitting} loadingText="Generando PDF…">
          Crear proforma
        </Button>
      </div>
    </form>
  );
}
