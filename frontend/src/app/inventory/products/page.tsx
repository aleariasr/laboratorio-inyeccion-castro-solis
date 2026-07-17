"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import {
  BoxIcon,
  SearchIcon,
} from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import {
  canReadInventory,
  canWriteInventory,
} from "@/features/auth/permissions";
import { getProducts } from "@/features/inventory/products/api";
import type {
  Product,
  ProductFilters,
} from "@/features/inventory/products/types";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";
import type { PaginatedResponse } from "@/lib/api/types";

type LoadState =
  | {
      status: "loading";
      data: null;
      message: null;
    }
  | {
      status: "success";
      data: PaginatedResponse<Product>;
      message: null;
    }
  | {
      status: "forbidden" | "error";
      data: null;
      message: string;
    };

const INITIAL_FILTERS: ProductFilters = {
  query: "",
  activeState: "active",
  page: 1,
  pageSize: 50,
};

function getLoadErrorMessage(
  error: unknown,
): string {
  if (error instanceof ApiTimeoutError) {
    return "La consulta tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible consultar los productos.";
}

function isLowStock(product: Product): boolean {
  return (
    product.is_active &&
    product.current_stock <= product.minimum_stock
  );
}

function formatStock(
  value: number,
  unitOfMeasure: string,
): string {
  return `${value} ${unitOfMeasure}`;
}

export default function ProductsPage() {
  const router = useRouter();

  const {
    status: authStatus,
    user,
    token,
    logout,
  } = useAuth();

  const searchInputRef =
    useRef<HTMLInputElement>(null);

  const rowRefs =
    useRef<Array<HTMLTableRowElement | null>>(
      [],
    );

  const [draftQuery, setDraftQuery] =
    useState("");

  const [filters, setFilters] =
    useState<ProductFilters>(
      INITIAL_FILTERS,
    );

  const [loadState, setLoadState] =
    useState<LoadState>({
      status: "loading",
      data: null,
      message: null,
    });

  const hasInventoryAccess =
    user ? canReadInventory(user) : false;

  const hasWriteAccess =
    user ? canWriteInventory(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasInventoryAccess
    ) {
      return;
    }

    const controller = new AbortController();

    getProducts(
      token,
      filters,
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({
          status: "success",
          data,
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

        if (
          error instanceof ApiError &&
          error.status === 403
        ) {
          setLoadState({
            status: "forbidden",
            data: null,
            message:
              "Este usuario no tiene permisos para consultar el inventario.",
          });

          return;
        }

        setLoadState({
          status: "error",
          data: null,
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    authStatus,
    filters,
    hasInventoryAccess,
    logout,
    router,
    token,
  ]);

  useEffect(() => {
    function handleGlobalKeyboard(
      event: KeyboardEvent,
    ): void {
      const target =
        event.target as HTMLElement | null;

      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true;

      if (
        event.key.toLowerCase() === "f" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isTyping
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }

    globalThis.addEventListener(
      "keydown",
      handleGlobalKeyboard,
    );

    return () => {
      globalThis.removeEventListener(
        "keydown",
        handleGlobalKeyboard,
      );
    };
  }, []);

  async function handleRetry(): Promise<void> {
    if (!token) {
      return;
    }

    setLoadState({
      status: "loading",
      data: null,
      message: null,
    });

    try {
      const data = await getProducts(
        token,
        filters,
      );

      setLoadState({
        status: "success",
        data,
        message: null,
      });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        await logout();
        router.replace("/login");
        return;
      }

      if (
        error instanceof ApiError &&
        error.status === 403
      ) {
        setLoadState({
          status: "forbidden",
          data: null,
          message:
            "Este usuario no tiene permisos para consultar el inventario.",
        });

        return;
      }

      setLoadState({
        status: "error",
        data: null,
        message: getLoadErrorMessage(error),
      });
    }
  }

  function updateFilters(
    updater: (
      current: ProductFilters,
    ) => ProductFilters,
  ): void {
    setLoadState({
      status: "loading",
      data: null,
      message: null,
    });

    setFilters(updater);
  }

  function openProduct(productId: number): void {
    router.push(
      `/inventory/products/${productId}`,
    );
  }

  function handleSearchSubmit(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();

    updateFilters((current) => ({
      ...current,
      query: draftQuery.trim(),
      page: 1,
    }));
  }

  function handleClearSearch(): void {
    setDraftQuery("");

    updateFilters((current) => ({
      ...current,
      query: "",
      page: 1,
    }));

    searchInputRef.current?.focus();
  }

  function handleRowKeyDown(
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    rowIndex: number,
  ): void {
    if (event.key === "Enter") {
      event.preventDefault();

      const product =
        loadState.status === "success"
          ? loadState.data.results[rowIndex]
          : null;

      if (product) {
        openProduct(product.id);
      }

      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      rowRefs.current[rowIndex + 1]?.focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      rowRefs.current[rowIndex - 1]?.focus();
      return;
    }

    if (
      event.key === "PageDown" &&
      loadState.status === "success" &&
      loadState.data.next
    ) {
      event.preventDefault();

      updateFilters((current) => ({
        ...current,
        page: current.page + 1,
      }));

      return;
    }

    if (
      event.key === "PageUp" &&
      loadState.status === "success" &&
      loadState.data.previous
    ) {
      event.preventDefault();

      updateFilters((current) => ({
        ...current,
        page: current.page - 1,
      }));
    }
  }

  if (
    authStatus === "authenticated" &&
    user &&
    !hasInventoryAccess
  ) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de inventario."
      >
        <StatePanel
          title="No tiene acceso a productos"
          message="Solicite a una persona administradora que revise los permisos de su usuario."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/dashboard");
              }}
            >
              Volver al inicio
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Productos"
      description="Consulte piezas, ubicaciones y existencias actuales."
      actions={
        hasWriteAccess ? (
          <Button
            type="button"
            onClick={() => {
              router.push(
                "/inventory/products/new",
              );
            }}
          >
            Nuevo producto
          </Button>
        ) : undefined
      }
    >
      <section
        className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
        aria-labelledby="products-list-title"
      >
        <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2
                id="products-list-title"
                className="text-lg font-semibold tracking-[-0.02em] text-foreground"
              >
                Catálogo de productos
              </h2>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Busque por código, nombre, descripción o ubicación.
              </p>
            </div>

            <form
              className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-3xl"
              onSubmit={handleSearchSubmit}
              role="search"
            >
              <div className="relative min-w-0 flex-1">
                <span
                  className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted-foreground"
                  aria-hidden="true"
                >
                  <SearchIcon />
                </span>

                <Input
                  ref={searchInputRef}
                  value={draftQuery}
                  onChange={(event) => {
                    setDraftQuery(
                      event.target.value,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Escape"
                    ) {
                      event.preventDefault();
                      handleClearSearch();
                    }
                  }}
                  className="pl-12 pr-24"
                  placeholder="Código, producto o ubicación"
                  aria-label="Buscar productos"
                  autoComplete="off"
                  spellCheck={false}
                />

                <span className="pointer-events-none absolute inset-y-0 right-4 hidden items-center text-xs font-semibold text-[var(--color-text-subtle)] sm:flex">
                  Tecla F
                </span>
              </div>

              <select
                value={filters.activeState}
                onChange={(event) => {
                  const activeState =
                    event.target.value as ProductFilters["activeState"];

                  updateFilters((current) => ({
                    ...current,
                    activeState,
                    page: 1,
                  }));
                }}
                className="h-12 rounded-[var(--radius-md)] border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
                aria-label="Filtrar productos por estado"
              >
                <option value="active">
                  Activos
                </option>

                <option value="inactive">
                  Inactivos
                </option>

                <option value="all">
                  Todos
                </option>
              </select>

              <Button type="submit">
                Buscar
              </Button>
            </form>
          </div>

          {filters.query && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Resultados para{" "}
                <span className="font-semibold text-foreground">
                  “{filters.query}”
                </span>
              </p>

              <button
                type="button"
                onClick={handleClearSearch}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Limpiar búsqueda
              </button>
            </div>
          )}
        </div>

        {loadState.status === "loading" && (
          <LoadingState message="Consultando productos…" />
        )}

        {loadState.status === "forbidden" && (
          <div className="p-6">
            <StatePanel
              title="Acceso restringido"
              message={loadState.message}
              tone="warning"
            />
          </div>
        )}

        {loadState.status === "error" && (
          <div className="p-6">
            <StatePanel
              title="No se pudieron cargar los productos"
              message={loadState.message}
              tone="error"
              action={
                <Button
                  type="button"
                  onClick={() => {
                    void handleRetry();
                  }}
                >
                  Reintentar
                </Button>
              }
            />
          </div>
        )}

        {loadState.status === "success" &&
          loadState.data.results.length === 0 && (
            <div className="p-6">
              <StatePanel
                title={
                  filters.query
                    ? "No se encontraron productos"
                    : "No hay productos registrados"
                }
                message={
                  filters.query
                    ? "Revise el código o intente con otro nombre, descripción o ubicación."
                    : "El catálogo todavía no contiene productos para el filtro seleccionado."
                }
                icon={<BoxIcon />}
                action={
                  filters.query ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleClearSearch}
                    >
                      Limpiar búsqueda
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}

        {loadState.status === "success" &&
          loadState.data.results.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Código
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Producto
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Ubicación
                      </th>

                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Existencia
                      </th>

                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Mínimo
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Estado
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {loadState.data.results.map(
                      (product, index) => {
                        const lowStock =
                          isLowStock(product);

                        return (
                          <tr
                            key={product.id}
                            ref={(element) => {
                              rowRefs.current[index] =
                                element;
                            }}
                            tabIndex={0}
                            role="link"
                            aria-label={`Abrir producto ${product.standard_code}, ${product.name}`}
                            onClick={() => {
                              openProduct(product.id);
                            }}
                            onKeyDown={(event) => {
                              handleRowKeyDown(
                                event,
                                index,
                              );
                            }}
                            className="cursor-pointer border-b border-[var(--color-border-soft)] transition-colors last:border-b-0 hover:bg-[rgb(7_81_132_/_3%)] focus:bg-[var(--color-primary-soft)] focus:outline-none"
                          >
                            <td className="px-5 py-4 align-top">
                              <span className="font-mono text-sm font-semibold text-foreground">
                                {product.standard_code}
                              </span>
                            </td>

                            <td className="px-5 py-4 align-top">
                              <p className="font-semibold text-foreground">
                                {product.name}
                              </p>

                              {product.description && (
                                <p className="mt-1 max-w-lg text-sm leading-5 text-muted-foreground">
                                  {product.description}
                                </p>
                              )}
                            </td>

                            <td className="px-5 py-4 align-top">
                              <span className="inline-flex rounded-[var(--radius-sm)] bg-surface-muted px-2.5 py-1 font-mono text-sm font-semibold text-foreground">
                                {
                                  product
                                    .storage_location_detail
                                    .code
                                }
                              </span>
                            </td>

                            <td className="px-5 py-4 text-right align-top">
                              <p
                                className={[
                                  "font-mono text-sm font-semibold",
                                  lowStock
                                    ? "text-[var(--color-warning)]"
                                    : "text-foreground",
                                ].join(" ")}
                              >
                                {formatStock(
                                  product.current_stock,
                                  product.unit_of_measure,
                                )}
                              </p>

                              {lowStock && (
                                <p className="mt-1 text-xs font-semibold text-[var(--color-warning)]">
                                  Bajo mínimo
                                </p>
                              )}
                            </td>

                            <td className="px-5 py-4 text-right align-top font-mono text-sm text-muted-foreground">
                              {formatStock(
                                product.minimum_stock,
                                product.unit_of_measure,
                              )}
                            </td>

                            <td className="px-5 py-4 align-top">
                              <span
                                className={[
                                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                                  product.is_active
                                    ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                                    : "bg-surface-muted text-muted-foreground",
                                ].join(" ")}
                              >
                                <span
                                  className={[
                                    "size-1.5 rounded-full",
                                    product.is_active
                                      ? "bg-[var(--color-success)]"
                                      : "bg-[var(--color-text-subtle)]",
                                  ].join(" ")}
                                  aria-hidden="true"
                                />

                                {product.is_active
                                  ? "Activo"
                                  : "Inactivo"}
                              </span>
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={filters.page}
                pageSize={filters.pageSize}
                totalItems={loadState.data.count}
                hasNextPage={
                  loadState.data.next !== null
                }
                hasPreviousPage={
                  loadState.data.previous !== null
                }
                onPageChange={(page) => {
                  updateFilters((current) => ({
                    ...current,
                    page,
                  }));
                }}
              />
            </>
          )}
      </section>
    </AppShell>
  );
}