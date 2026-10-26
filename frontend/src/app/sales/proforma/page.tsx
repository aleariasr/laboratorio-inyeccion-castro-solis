"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AmountsSummary } from "@/components/documents/amounts-summary";
import { DiscountTaxFields } from "@/components/documents/discount-tax-fields";
import { FormError } from "@/components/feedback/form-error";
import { StatePanel } from "@/components/feedback/state-panel";
import { Field } from "@/components/forms/field";
import { CloseIcon, SearchIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import {
  canCreateCustomers,
  canCreateProformas,
  canReadCustomers,
} from "@/features/auth/permissions";
import { createProforma, getProducts } from "@/features/inventory/products/api";
import type { Product } from "@/features/inventory/products/types";
import { formatMoney } from "@/features/inventory/purchases/format";
import {
  CustomerPicker,
  type SelectedCustomer,
} from "@/features/sales/customer-picker";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import {
  computeDocumentAmounts,
  type DiscountType,
} from "@/lib/document-amounts";

// Mismo tope que el backend (MAX_PROFORMA_QUANTITY en
// apps/documents/views.py).
const MAX_QUANTITY = 9999;

type ProformaLine = {
  product: Product;
  quantityText: string;
};

function parseQuantity(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) {
    return null;
  }

  const quantity = Number(text);

  return quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La proforma tardó demasiado tiempo en generarse.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible generar la proforma.";
}

export default function NewProformaPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [query, setQuery] = useState("");

  const [results, setResults] = useState<Product[]>([]);

  const [isResultListOpen, setIsResultListOpen] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  const [lines, setLines] = useState<ProformaLine[]>([]);

  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [wasDownloaded, setWasDownloaded] = useState(false);

  // Punto 15: mismo descuento e impuesto que la venta; 13 % por defecto.
  const [discountType, setDiscountType] = useState<DiscountType>("AMOUNT");

  const [discountValue, setDiscountValue] = useState("0");

  const [taxPercentage, setTaxPercentage] = useState("13");

  const [amountServerErrors, setAmountServerErrors] = useState<{
    discountValue?: string;
    taxPercentage?: string;
  }>({});

  const hasProformaAccess = user ? canCreateProformas(user) : false;

  const hasCustomersAccess = user ? canReadCustomers(user) : false;

  useEffect(() => {
    if (!token || !hasProformaAccess) {
      return;
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      getProducts(
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

          setSearchError("No fue posible buscar productos.");
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [hasProformaAccess, query, token]);

  function handleQueryChange(value: string): void {
    setQuery(value);
    setIsResultListOpen(true);

    if (value.trim().length < 2) {
      setResults([]);
      setSearchError(null);
    }
  }

  function addProduct(product: Product): void {
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);

      if (!existing) {
        return [...current, { product, quantityText: "1" }];
      }

      // Agregarlo otra vez suma uno, en vez de duplicar la línea.
      const nextQuantity = Math.min(
        (parseQuantity(existing.quantityText) ?? 0) + 1,
        MAX_QUANTITY,
      );

      return current.map((line) =>
        line.product.id === product.id
          ? { ...line, quantityText: String(nextQuantity) }
          : line,
      );
    });

    setQuery("");
    setResults([]);
    setIsResultListOpen(false);
    setSubmitError(null);
    setWasDownloaded(false);
  }

  function updateQuantity(productId: number, quantityText: string): void {
    setLines((current) =>
      current.map((line) =>
        line.product.id === productId ? { ...line, quantityText } : line,
      ),
    );
    setSubmitError(null);
    setWasDownloaded(false);
  }

  function removeLine(productId: number): void {
    setLines((current) =>
      current.filter((line) => line.product.id !== productId),
    );
    setSubmitError(null);
    setWasDownloaded(false);
  }

  const unitsCount = lines.reduce(
    (total, line) => total + (parseQuantity(line.quantityText) ?? 0),
    0,
  );

  const referenceTotal = lines.reduce((total, line) => {
    const quantity = parseQuantity(line.quantityText);
    const price = line.product.effective_sale_price;

    if (quantity === null || price === null) {
      return total;
    }

    return total + Number(price) * quantity;
  }, 0);

  const linesWithoutPrice = lines.filter(
    (line) => line.product.effective_sale_price === null,
  ).length;

  // Vista previa con el mismo cálculo que el PDF (apps/core/money.py).
  const amountsPreview = computeDocumentAmounts(
    referenceTotal,
    discountType,
    Number(discountValue || 0),
    Number(taxPercentage || 0),
  );

  const amountErrors = {
    ...amountServerErrors,
    ...(!amountsPreview.ok
      ? { [amountsPreview.field]: amountsPreview.message }
      : {}),
  };

  function changeAmountSetting(apply: () => void): void {
    apply();
    setAmountServerErrors({});
    setSubmitError(null);
    setWasDownloaded(false);
  }

  async function handleGenerate(): Promise<void> {
    if (!token || isGenerating) {
      return;
    }

    if (lines.length === 0) {
      setSubmitError("Agregue al menos un producto.");
      return;
    }

    const items = lines.map((line) => ({
      productId: line.product.id,
      quantity: parseQuantity(line.quantityText),
    }));

    if (items.some((item) => item.quantity === null)) {
      setSubmitError(
        `Revise las cantidades: deben ser números enteros entre 1 y ${MAX_QUANTITY}.`,
      );
      return;
    }

    if (!amountsPreview.ok) {
      setSubmitError("Revise el descuento o el impuesto.");
      return;
    }

    setIsGenerating(true);
    setSubmitError(null);
    setWasDownloaded(false);

    try {
      const blob = await createProforma(
        token,
        items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity ?? 1,
        })),
        customer?.id ?? null,
        { discountType, discountValue, taxPercentage },
      );

      const downloadUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = downloadUrl;
      anchor.download = "proforma.pdf";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      globalThis.setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 1_000);

      setWasDownloaded(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para generar proformas.");
        return;
      }

      if (
        error instanceof ApiError &&
        error.status === 400 &&
        (error.fieldErrors.discount_value || error.fieldErrors.tax_percentage)
      ) {
        setAmountServerErrors({
          discountValue: error.fieldErrors.discount_value?.[0],
          taxPercentage: error.fieldErrors.tax_percentage?.[0],
        });
        return;
      }

      setSubmitError(getSubmitErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  }

  const backButton = (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        router.push("/sales");
      }}
    >
      Volver a ventas
    </Button>
  );

  if (authStatus === "authenticated" && user && !hasProformaAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permiso para generar documentos."
      >
        <StatePanel
          title="No puede generar proformas"
          message="Su usuario no tiene permiso para generar proformas."
          tone="warning"
          action={backButton}
        />
      </AppShell>
    );
  }

  if (!token) {
    return null;
  }

  return (
    <AppShell
      title="Nueva proforma"
      description="Cotización en PDF con el precio de venta actual. No registra una venta ni mueve inventario."
      actions={backButton}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section
          className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
          aria-labelledby="proforma-products-title"
        >
          <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
            <h2
              id="proforma-products-title"
              className="text-lg font-semibold tracking-[-0.02em] text-foreground"
            >
              Productos
            </h2>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Busque por código o nombre. Si agrega un producto que ya está en la lista, se suma uno a su cantidad.
            </p>

            <div className="relative mt-4">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                <SearchIcon className="size-5" />
              </span>

              <Input
                id="proforma-product-search"
                value={query}
                onChange={(event) => {
                  handleQueryChange(event.target.value);
                }}
                onFocus={() => {
                  setIsResultListOpen(true);
                }}
                onBlur={() => {
                  globalThis.setTimeout(() => {
                    setIsResultListOpen(false);
                  }, 150);
                }}
                placeholder="Código o nombre del producto"
                autoComplete="off"
                aria-label="Buscar producto"
                className="pl-12"
                disabled={isGenerating}
              />

              {isResultListOpen && query.trim().length >= 2 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                  {searchError && (
                    <p className="px-4 py-3 text-sm text-[var(--color-danger)]">
                      {searchError}
                    </p>
                  )}

                  {!searchError && results.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      Sin resultados.
                    </p>
                  )}

                  {!searchError && results.length > 0 && (
                    <ul className="max-h-72 overflow-y-auto">
                      {results.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              addProduct(product);
                            }}
                            className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                          >
                            <span className="min-w-0">
                              <span className="font-mono text-xs text-muted-foreground">
                                {product.standard_code}
                              </span>

                              <span className="ml-2 font-semibold text-foreground">
                                {product.name}
                              </span>
                            </span>

                            <span className="shrink-0 text-xs text-muted-foreground">
                              {product.current_stock} en stock ·{" "}
                              {product.effective_sale_price
                                ? `₡${formatMoney(product.effective_sale_price)}`
                                : "Sin precio"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-foreground">
                Todavía no hay productos en la proforma
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Búsquelos arriba para empezar a armarla.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th scope="col" className="border-b border-[var(--color-border-soft)] px-5 py-3 font-medium sm:px-6">
                      Producto
                    </th>
                    <th scope="col" className="border-b border-[var(--color-border-soft)] px-3 py-3 text-center font-medium">
                      Cantidad
                    </th>
                    <th scope="col" className="border-b border-[var(--color-border-soft)] px-3 py-3 text-right font-medium">
                      Importe
                    </th>
                    <th scope="col" className="w-14 border-b border-[var(--color-border-soft)] px-3 py-3">
                      <span className="sr-only">Quitar</span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {lines.map((line) => {
                    const quantity = parseQuantity(line.quantityText);
                    const price = line.product.effective_sale_price;

                    return (
                      <tr key={line.product.id}>
                        <td className="border-b border-[var(--color-border-soft)] px-5 py-3 sm:px-6">
                          <span className="block font-semibold text-foreground">
                            {line.product.name}
                          </span>

                          <span className="font-mono text-xs text-muted-foreground">
                            {line.product.standard_code}
                            {price ? ` · ₡${formatMoney(price)} c/u` : ""}
                          </span>
                        </td>

                        <td className="border-b border-[var(--color-border-soft)] px-3 py-3 text-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={line.quantityText}
                            onChange={(event) => {
                              updateQuantity(line.product.id, event.target.value);
                            }}
                            aria-label={`Cantidad de ${line.product.name}`}
                            aria-invalid={quantity === null || undefined}
                            disabled={isGenerating}
                            className={[
                              "h-10 w-20 rounded-[var(--radius-md)] border bg-surface px-2 text-center font-mono text-sm text-foreground",
                              "focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]",
                              quantity === null
                                ? "border-[var(--color-danger)]"
                                : "border-border",
                            ].join(" ")}
                          />
                        </td>

                        <td className="border-b border-[var(--color-border-soft)] px-3 py-3 text-right font-mono">
                          {price === null ? (
                            <span className="font-sans text-xs font-semibold text-[var(--color-warning)]">
                              Sin precio
                            </span>
                          ) : quantity === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            `₡${formatMoney(Number(price) * quantity)}`
                          )}
                        </td>

                        <td className="border-b border-[var(--color-border-soft)] px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              removeLine(line.product.id);
                            }}
                            disabled={isGenerating}
                            aria-label={`Quitar ${line.product.name}`}
                            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                          >
                            <CloseIcon className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:sticky lg:top-6">
          <section className="rounded-[var(--radius-xl)] bg-surface p-5 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:p-6">
            <Field
              id="proforma-customer"
              label="Cliente"
              hint={`Opcional. Si lo deja vacío, la proforma sale sin datos de cliente.${user && canCreateCustomers(user) ? " Si no existe, se crea desde la lista." : ""}`}
            >
              <CustomerPicker
                id="proforma-customer"
                canReadCustomers={hasCustomersAccess}
                canCreateCustomers={user ? canCreateCustomers(user) : false}
                token={token}
                value={customer}
                onChange={(nextCustomer) => {
                  setCustomer(nextCustomer);
                  setWasDownloaded(false);
                }}
                disabled={isGenerating}
              />
            </Field>
          </section>

          <section
            className="rounded-[var(--radius-xl)] bg-surface p-5 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:p-6"
            aria-labelledby="proforma-summary-title"
          >
            <h2
              id="proforma-summary-title"
              className="text-lg font-semibold tracking-[-0.02em] text-foreground"
            >
              Resumen
            </h2>

            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Productos</dt>
                <dd className="font-mono">{lines.length}</dd>
              </div>

              <div className="flex justify-between text-muted-foreground">
                <dt>Unidades</dt>
                <dd className="font-mono">{unitsCount}</dd>
              </div>
            </dl>

            <div className="mt-5 grid gap-5 border-t border-[var(--color-border-soft)] pt-5">
              <DiscountTaxFields
                idPrefix="proforma"
                discountType={discountType}
                discountValue={discountValue}
                taxPercentage={taxPercentage}
                onDiscountTypeChange={(value) => {
                  changeAmountSetting(() => setDiscountType(value));
                }}
                onDiscountValueChange={(value) => {
                  changeAmountSetting(() => setDiscountValue(value));
                }}
                onTaxPercentageChange={(value) => {
                  changeAmountSetting(() => setTaxPercentage(value));
                }}
                discountError={amountErrors.discountValue}
                taxError={amountErrors.taxPercentage}
                disabled={isGenerating}
              />

              <AmountsSummary
                amounts={amountsPreview.ok ? amountsPreview.amounts : null}
                fallbackSubtotal={referenceTotal}
                discountType={discountType}
                discountValue={discountValue || "0"}
                taxPercentage={taxPercentage || "0"}
                showZeroRows
              />
            </div>

            {linesWithoutPrice > 0 && (
              <p className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-warning-soft)] px-4 py-3 text-xs font-medium leading-5 text-[var(--color-warning)]">
                {linesWithoutPrice === 1
                  ? "1 producto no tiene precio de venta"
                  : `${linesWithoutPrice} productos no tienen precio de venta`}
                : en el PDF sale como &ldquo;Sin precio definido&rdquo; y no suma al total.
              </p>
            )}

            {submitError && (
              <div className="mt-4">
                <FormError message={submitError} />
              </div>
            )}

            {wasDownloaded && (
              <p className="mt-4 text-sm font-medium text-[var(--color-success)]">
                Proforma descargada.
              </p>
            )}

            <Button
              type="button"
              className="mt-5 w-full"
              isLoading={isGenerating}
              loadingText="Generando PDF…"
              onClick={() => {
                void handleGenerate();
              }}
            >
              Descargar proforma
            </Button>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
