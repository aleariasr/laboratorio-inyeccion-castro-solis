"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

import { searchCustomers } from "./api";
import type { CustomerSummary } from "./types";

export type SelectedCustomer = {
  id: number;
  label: string;
};

type CustomerPickerProps = {
  id: string;
  canReadCustomers: boolean;
  token: string;
  value: SelectedCustomer | null;
  onChange: (customer: SelectedCustomer | null) => void;
  disabled?: boolean;
};

/**
 * Buscador de cliente opcional (proformas). Busca desde 2 caracteres,
 * con 350 ms de espera, y al elegir muestra el nombre con "Cambiar".
 */
export function CustomerPicker({
  id,
  canReadCustomers,
  token,
  value,
  onChange,
  disabled = false,
}: CustomerPickerProps) {
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
    onChange({ id: customer.id, label: customer.display_name });
    setCustomerQuery("");
    setCustomerResults([]);
    setIsCustomerListOpen(false);
  }

  function clearSelectedCustomer(): void {
    onChange(null);
    setCustomerQuery("");
    setCustomerResults([]);
  }

  function handleQueryChange(nextValue: string): void {
    setCustomerQuery(nextValue);
    setIsCustomerListOpen(true);

    if (nextValue.trim().length < 2) {
      setCustomerResults([]);
      setCustomerSearchError(null);
    }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-2.5">
        <span className="text-sm font-medium text-foreground">
          {value.label}
        </span>

        <button
          type="button"
          onClick={clearSelectedCustomer}
          className="text-xs font-semibold text-primary hover:underline"
          disabled={disabled}
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        id={id}
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
        disabled={disabled}
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
  );
}
