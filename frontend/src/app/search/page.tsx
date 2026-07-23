"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { SearchIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { universalSearch } from "@/features/search/api";
import type {
  UniversalSearchResponse,
  UniversalSearchResults,
} from "@/features/search/types";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";

const EMPTY_RESULTS: UniversalSearchResults = {
  products: [],
  locations: [],
  product_references: [],
  suppliers: [],
  purchases: [],
  customers: [],
  injectors: [],
};

type SearchState =
  | {
      status: "idle";
      data: null;
      message: null;
    }
  | {
      status: "loading";
      data: UniversalSearchResponse | null;
      message: null;
    }
  | {
      status: "success";
      data: UniversalSearchResponse;
      message: null;
    }
  | {
      status: "error";
      data: null;
      message: string;
    };

function formatDate(value: string): string {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatPurchaseStatus(
  value: string,
): string {
  const labels: Record<string, string> = {
    DRAFT: "Borrador",
    CONFIRMED: "Confirmada",
    CANCELLED: "Anulada",
  };

  return labels[value] ?? value;
}

function getSearchErrorMessage(
  error: unknown,
): string {
  if (error instanceof ApiTimeoutError) {
    return "La búsqueda tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible realizar la búsqueda.";
}

function getTotalResults(
  results: UniversalSearchResults,
): number {
  return (
    results.products.length +
    results.locations.length +
    results.product_references.length +
    results.suppliers.length +
    results.purchases.length +
    results.customers.length +
    results.injectors.length
  );
}

type ResultSectionProps = Readonly<{
  title: string;
  count: number;
  children: ReactNode;
}>;

function ResultSection({
  title,
  count,
  children,
}: ResultSectionProps) {
  if (count === 0) {
    return null;
  }

  return (
    <section className="app-status-card overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border-soft)] px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h2>

        <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-blue)]">
          {count}
        </span>
      </div>

      <div className="divide-y divide-[var(--color-border-soft)]">
        {children}
      </div>
    </section>
  );
}

type ResultRowProps = Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
  metadata?: ReactNode;
  href?: string;
}>;

function ResultRow({
  eyebrow,
  title,
  description,
  metadata,
  href,
}: ResultRowProps) {
  const content = (
    <div
      className={[
        "group flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        href
          ? "transition-colors hover:bg-surface-muted/70"
          : "",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            {eyebrow}
          </p>
        )}

        <p className="break-words text-[15px] font-semibold text-foreground">
          {title}
        </p>

        {description && (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}

        {metadata && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {metadata}
          </div>
        )}
      </div>

      {href && (
        <div className="shrink-0 text-sm font-semibold text-[var(--color-brand-blue)]">
          Ver detalle
          <span
            className="ml-1 inline-block transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            →
          </span>
        </div>
      )}
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link
      href={href}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-blue)]"
    >
      {content}
    </Link>
  );
}

export default function SearchPage() {
  const router = useRouter();

  const {
    status: authStatus,
    token,
    logout,
  } = useAuth();

  const [query, setQuery] = useState("");

  const [submittedQuery, setSubmittedQuery] =
    useState("");

  const [
    searchReloadKey,
    setSearchReloadKey,
  ] = useState(0);

  const [searchState, setSearchState] =
    useState<SearchState>({
      status: "idle",
      data: null,
      message: null,
    });

  const inputRef =
    useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleSearchShortcut(
        event: KeyboardEvent,
    ): void {
        const target =
        event.target as HTMLElement | null;

        const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

        if (
        event.key.toLowerCase() === "f" &&
        !isTyping &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
        ) {
        event.preventDefault();

        inputRef.current?.focus();
        inputRef.current?.select();
        }
    }

    globalThis.addEventListener(
        "keydown",
        handleSearchShortcut,
    );

    return () => {
        globalThis.removeEventListener(
        "keydown",
        handleSearchShortcut,
        );
    };
    }, []);

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token
    ) {
      return;
    }

    const normalizedQuery =
      submittedQuery.trim();

    if (normalizedQuery.length < 2) {
      return;
    }

    const controller =
      new AbortController();

    universalSearch(
      token,
      normalizedQuery,
      controller.signal,
    )
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        setSearchState({
          status: "success",
          data: response,
          message: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          void logout().then(() => {
            router.replace("/login");
          });

          return;
        }

        setSearchState({
          status: "error",
          data: null,
          message:
            getSearchErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    authStatus,
    logout,
    router,
    searchReloadKey,
    submittedQuery,
    token,
  ]);

  useEffect(() => {
    const normalizedQuery =
      query.trim();

    if (normalizedQuery.length < 2) {
      return;
    }

    const timeoutId =
      globalThis.setTimeout(() => {
        setSearchState((current) => ({
          status: "loading",
          data:
            current.status === "success" ||
            current.status === "loading"
              ? current.data
              : null,
          message: null,
        }));

        setSubmittedQuery(
          normalizedQuery,
        );

        setSearchReloadKey(
          (current) => current + 1,
        );
      }, 350);

    return () => {
      globalThis.clearTimeout(
        timeoutId,
      );
    };
  }, [query]);

  const visibleSearchData =
    searchState.status === "success" ||
    searchState.status === "loading"
      ? searchState.data
      : null;

  const results =
    visibleSearchData?.results ??
    EMPTY_RESULTS;

  const totalResults = useMemo(
    () => getTotalResults(results),
    [results],
  );

  function runSearch(): void {
    const normalizedQuery =
      query.trim();

    if (normalizedQuery.length < 2) {
      return;
    }

    setSearchState((current) => ({
      status: "loading",
      data:
        current.status === "success" ||
        current.status === "loading"
          ? current.data
          : null,
      message: null,
    }));

    setSubmittedQuery(
      normalizedQuery,
    );

    setSearchReloadKey(
      (current) => current + 1,
    );
  }

  function handleClear(): void {
    setQuery("");
    setSubmittedQuery("");
    setSearchReloadKey(0);

    setSearchState({
      status: "idle",
      data: null,
      message: null,
    });

    inputRef.current?.focus();
  }

  return (
    <AppShell
      title="Búsqueda universal"
      description="Encuentre rápidamente productos, ubicaciones, referencias, proveedores, compras, clientes e inyectores."
    >
      <div className="space-y-7">
        <section className="app-status-card overflow-hidden">
          <div className="relative overflow-hidden px-5 py-7 sm:px-8 sm:py-9">
            <div
              className="pointer-events-none absolute right-[-70px] top-[-80px] size-64 rounded-full bg-[var(--color-primary-soft)] opacity-70"
              aria-hidden="true"
            />

            <div className="relative max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.09em] text-[var(--color-brand-blue)]">
                Buscar en todo el sistema
              </p>

              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-2xl">
                ¿Qué necesita encontrar?
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Escriba un código de producto,
                ubicación, referencia, proveedor,
                factura, cliente o número de inyector.
              </p>

              <div className="mt-6">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-muted-foreground">
                    <SearchIcon className="size-5" />
                  </div>

                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(event) => {
                        const nextQuery =
                            event.target.value;

                        setQuery(nextQuery);

                        if (nextQuery.trim().length < 2) {
                            setSubmittedQuery("");
                            setSearchReloadKey(0);

                            setSearchState({
                            status: "idle",
                            data: null,
                            message: null,
                            });
                        }
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter"
                      ) {
                        event.preventDefault();
                        runSearch();
                      }

                      if (
                        event.key ===
                          "Escape" &&
                        query.length > 0
                      ) {
                        event.preventDefault();
                        handleClear();
                      }
                    }}
                    placeholder="Ej. 1-423, A124, FAC-001, Bosch, Cliente Diesel…"
                    aria-label="Buscar en todo el sistema"
                    autoComplete="off"
                    className="min-h-14 w-full rounded-2xl border border-[var(--color-border)] bg-background py-3.5 pl-12 pr-32 text-[15px] text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-[var(--color-brand-blue)] focus:ring-4 focus:ring-[var(--color-primary-soft)]"
                  />

                  {query.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="absolute inset-y-0 right-3 my-auto h-9 rounded-lg px-3 text-xs font-semibold text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    La búsqueda comienza
                    automáticamente al escribir
                    al menos 2 caracteres.
                  </p>

                  {searchState.status ===
                    "loading" && (
                    <p
                      className="text-xs font-medium text-[var(--color-brand-blue)]"
                      role="status"
                    >
                      Buscando…
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {query.trim().length === 1 && (
          <StatePanel
            title="Escriba un poco más"
            message="La búsqueda universal necesita al menos 2 caracteres."
            tone="neutral"
          />
        )}

        {query.trim().length === 0 &&
          searchState.status ===
            "idle" && (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  title: "Producto",
                  example:
                    "Código estándar o referencia",
                },
                {
                  title: "Ubicación",
                  example:
                    "Ej. A124, B50 o C015",
                },
                {
                  title: "Operación",
                  example:
                    "Factura o proveedor",
                },
                {
                  title: "Cliente",
                  example:
                    "Nombre o número de inyector",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="app-status-card p-5"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {item.title}
                  </p>

                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    {item.example}
                  </p>
                </div>
              ))}
            </section>
          )}

        {searchState.status ===
          "error" && (
          <StatePanel
            title="No se pudo realizar la búsqueda"
            message={searchState.message}
            tone="error"
            action={
              <Button
                type="button"
                onClick={() => {
                  runSearch();
                }}
              >
                Reintentar
              </Button>
            }
          />
        )}

        {visibleSearchData && (
          <>
            <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Resultados para
                </p>

                <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-foreground">
                  “{visibleSearchData.query}”
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[var(--color-border-soft)] bg-surface px-3 py-1.5 text-sm font-semibold text-foreground">
                  {totalResults}
                </span>

                <span className="text-sm text-muted-foreground">
                  {totalResults === 1
                    ? "resultado"
                    : "resultados"}
                </span>
              </div>
            </section>

            {totalResults === 0 ? (
              <StatePanel
                title="No encontramos coincidencias"
                message={`No existen resultados visibles para “${visibleSearchData.query}”. Revise el término e inténtelo nuevamente.`}
                tone="neutral"
              />
            ) : (
              <div className="grid items-start gap-6 xl:grid-cols-2">
                <ResultSection
                  title="Productos"
                  count={
                    results.products.length
                  }
                >
                  {results.products.map(
                    (product) => (
                      <ResultRow
                        key={product.id}
                        eyebrow={
                          product.standard_code
                        }
                        title={product.name}
                        description={
                          product.description ||
                          "Sin descripción"
                        }
                        href={`/inventory/products/${product.id}`}
                        metadata={
                          <>
                            {product.storage_location ? (
                              <span>
                                Ubicación{" "}
                                <strong className="font-semibold text-foreground">
                                  {
                                    product
                                      .storage_location
                                      .code
                                  }
                                </strong>
                              </span>
                            ) : (
                              <span>
                                Sin ubicación
                              </span>
                            )}
                          </>
                        }
                      />
                    ),
                  )}
                </ResultSection>

                <ResultSection
                  title="Ubicaciones"
                  count={
                    results.locations.length
                  }
                >
                  {results.locations.map(
                    (location) => (
                      <ResultRow
                        key={location.id}
                        eyebrow="Ubicación"
                        title={location.code}
                        description={
                          location.description ||
                          "Sin descripción"
                        }
                        href={`/inventory/locations/${location.id}`}
                      />
                    ),
                  )}
                </ResultSection>

                <ResultSection
                  title="Referencias de producto"
                  count={
                    results
                      .product_references
                      .length
                  }
                >
                  {results.product_references.map(
                    (reference) => (
                      <ResultRow
                        key={reference.id}
                        eyebrow={
                          reference.manufacturer ||
                          "Referencia"
                        }
                        title={
                          reference.reference_code
                        }
                        description={`${reference.product.name} · ${reference.product.standard_code}`}
                        href={`/inventory/products/${reference.product.id}`}
                      />
                    ),
                  )}
                </ResultSection>

                <ResultSection
                  title="Proveedores"
                  count={
                    results.suppliers.length
                  }
                >
                  {results.suppliers.map(
                    (supplier) => (
                      <ResultRow
                        key={supplier.id}
                        eyebrow={
                          supplier.country ||
                          "Proveedor"
                        }
                        title={supplier.name}
                        description={[
                          supplier.phone,
                          supplier.email,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ),
                  )}
                </ResultSection>

                <ResultSection
                  title="Compras"
                  count={
                    results.purchases.length
                  }
                >
                  {results.purchases.map(
                    (purchase) => (
                      <ResultRow
                        key={purchase.id}
                        eyebrow={`Factura ${purchase.invoice_number}`}
                        title={
                          purchase.supplier.name
                        }
                        description={`Compra del ${formatDate(
                          purchase.purchase_date,
                        )}`}
                        metadata={
                          <span className="font-semibold">
                            {formatPurchaseStatus(
                              purchase.status,
                            )}
                          </span>
                        }
                      />
                    ),
                  )}
                </ResultSection>

                <ResultSection
                  title="Clientes"
                  count={
                    results.customers.length
                  }
                >
                  {results.customers.map(
                    (customer) => (
                      <ResultRow
                        key={customer.id}
                        eyebrow={
                          customer.identification ||
                          "Cliente"
                        }
                        title={
                          customer.display_name
                        }
                        description={[
                          customer.phone,
                          customer.email,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ),
                  )}
                </ResultSection>

                <ResultSection
                  title="Inyectores"
                  count={
                    results.injectors.length
                  }
                >
                  {results.injectors.map(
                    (injector) => (
                      <ResultRow
                        key={injector.id}
                        eyebrow="Inyector"
                        title={
                          injector.injector_number
                        }
                        description={
                          injector.description ||
                          "Sin descripción"
                        }
                        metadata={
                          <span>
                            Cliente:{" "}
                            <strong className="font-semibold text-foreground">
                              {
                                injector.customer
                                  .display_name
                              }
                            </strong>
                          </span>
                        }
                      />
                    ),
                  )}
                </ResultSection>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
