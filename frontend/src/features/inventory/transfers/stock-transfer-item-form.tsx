"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findScannedProduct } from "@/features/inventory/products/scan";
import type { Product } from "@/features/inventory/products/types";
import { searchActiveProducts } from "@/features/inventory/suppliers/api";

type StockTransferItemFormProps = {
  token: string;
  isSubmitting: boolean;
  submitError: string | null;
  onSubmit: (product: Product, quantity: number) => Promise<boolean>;
};

function parseQuantity(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

  const quantity = Number(value);

  return quantity >= 1 ? quantity : null;
}

/**
 * Agregar un producto al traslado (punto 6). Se busca por código o nombre;
 * un código completo escaneado lo elige solo (findScannedProduct, como en
 * compras y ventas). Muestra la existencia: confirmar exige que alcance.
 */
export function StockTransferItemForm({
  token,
  isSubmitting,
  submitError,
  onSubmit,
}: StockTransferItemFormProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const quantityInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");

  const [results, setResults] = useState<Product[]>([]);

  const [isListOpen, setIsListOpen] = useState(false);

  const [selected, setSelected] = useState<Product | null>(null);

  const [quantity, setQuantity] = useState("1");

  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (selected || trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      searchActiveProducts(token, trimmedQuery, controller.signal)
        .then((products) => {
          if (controller.signal.aborted) {
            return;
          }

          const scanned = findScannedProduct(products, trimmedQuery);

          if (scanned) {
            setSelected(scanned);
            setResults([]);
            setIsListOpen(false);
            globalThis.setTimeout(() => {
              quantityInputRef.current?.select();
            });
            return;
          }

          setResults(products);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults([]);
          }
        });
    }, 300);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, selected, token]);

  function selectProduct(product: Product): void {
    setSelected(product);
    setResults([]);
    setIsListOpen(false);
    setLocalError(null);
    globalThis.setTimeout(() => {
      quantityInputRef.current?.select();
    });
  }

  function clearSelected(): void {
    setSelected(null);
    setQuery("");
    globalThis.setTimeout(() => {
      searchInputRef.current?.focus();
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const parsedQuantity = parseQuantity(quantity);

    if (!selected) {
      setLocalError("El producto es obligatorio.");
      return;
    }

    if (parsedQuantity === null) {
      setLocalError("La cantidad es un número entero mayor que 0.");
      return;
    }

    if (await onSubmit(selected, parsedQuantity)) {
      setQuantity("1");
      clearSelected();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      noValidate
      className="grid gap-4 rounded-[var(--radius-lg)] bg-surface-muted/50 p-4 ring-1 ring-[var(--color-border-soft)] sm:p-5"
    >
      <p className="text-sm font-semibold text-foreground">Agregar producto</p>

      {(localError || submitError) && <FormError message={localError ?? submitError ?? ""} />}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
        <Field id="stock-transfer-item-product" label="Producto">
          {selected ? (
            <div className="flex h-12 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                <span className="font-mono font-semibold">{selected.standard_code}</span>{" "}
                {selected.name}
                <span className="ml-2 text-muted-foreground">
                  · hay {selected.current_stock} {selected.unit_of_measure}
                </span>
              </span>

              <button
                type="button"
                onClick={clearSelected}
                className="shrink-0 text-xs font-semibold text-primary hover:underline"
                disabled={isSubmitting}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                ref={searchInputRef}
                id="stock-transfer-item-product"
                value={query}
                onChange={(event) => {
                  const nextValue = event.target.value;

                  setQuery(nextValue);
                  setIsListOpen(true);

                  if (nextValue.trim().length < 2) {
                    setResults([]);
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
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                  }
                }}
                placeholder="Código, nombre o escanear"
                autoComplete="off"
                disabled={isSubmitting}
              />

              {isListOpen && query.trim().length >= 2 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                  {results.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados.</p>
                  ) : (
                    <ul className="max-h-64 overflow-y-auto">
                      {results.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectProduct(product);
                            }}
                            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                          >
                            <span className="min-w-0">
                              <span className="font-mono font-semibold text-foreground">
                                {product.standard_code}
                              </span>
                              <span className="ml-2 text-muted-foreground">{product.name}</span>
                            </span>

                            <span
                              className={[
                                "shrink-0 font-mono text-xs",
                                product.current_stock > 0
                                  ? "text-muted-foreground"
                                  : "text-[var(--color-warning)]",
                              ].join(" ")}
                            >
                              {product.current_stock} {product.unit_of_measure}
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

        <Field id="stock-transfer-item-quantity" label="Cantidad">
          <Input
            ref={quantityInputRef}
            id="stock-transfer-item-quantity"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setLocalError(null);
            }}
            inputMode="numeric"
            autoComplete="off"
            className="text-right"
            disabled={isSubmitting}
          />
        </Field>

        <Button type="submit" className="min-h-12" isLoading={isSubmitting} loadingText="Agregando…">
          Agregar
        </Button>
      </div>
    </form>
  );
}
