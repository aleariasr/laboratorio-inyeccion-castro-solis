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
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import {
  canCreateCustomers,
  canReadCustomers,
  canReadProducts,
  canWriteProducts,
} from "@/features/auth/permissions";
import { formatMoney } from "@/features/inventory/purchases/format";
import {
  createProforma,
  generateProductLabels,
  getProducts,
  type ProductLabelItem,
  type ProformaAmountSettings,
} from "@/features/inventory/products/api";
import {
  readStoredProductOrdering,
  storeProductOrdering,
} from "@/features/inventory/products/ordering";
import { ProductLabelsForm } from "@/features/inventory/products/product-labels-form";
import { ProductOrderingSelect } from "@/features/inventory/products/product-ordering-select";
import { ProformaForm } from "@/features/inventory/products/proforma-form";
import {
  DEFAULT_PRODUCT_ORDERING,
  VARIANT_KIND_LABELS,
} from "@/features/inventory/products/types";
import type {
  Product,
  ProductFilters,
  ProductOrdering,
  ProductOrderingField,
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

type LabelGenerationState =
  | {
      status: "idle";
      message: null;
    }
  | {
      status: "generating";
      message: null;
    }
  | {
      status: "error";
      message: string;
    };

type ProformaState =
  | {
      status: "idle";
      message: null;
    }
  | {
      status: "generating";
      message: null;
    }
  | {
      status: "error";
      message: string;
    };

const INITIAL_FILTERS: ProductFilters = {
  query: "",
  activeState: "active",
  ordering: DEFAULT_PRODUCT_ORDERING,
  page: 1,
  pageSize: 50,
};

const HEADER_CLASSES =
  "px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

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

/**
 * Encabezado que ordena la lista por su columna (punto 2). Muestra la
 * flecha cuando la lista está ordenada por esa columna.
 */
function SortableHeader({
  field,
  ordering,
  onToggle,
  alignRight = false,
  children,
}: {
  field: ProductOrderingField;
  ordering: ProductOrdering | undefined;
  onToggle: (field: ProductOrderingField) => void;
  alignRight?: boolean;
  children: string;
}) {
  const direction =
    ordering?.field === field
      ? ordering.direction
      : null;

  return (
    <th
      className={`${HEADER_CLASSES} ${alignRight ? "text-right" : ""}`}
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
    >
      <button
        type="button"
        onClick={() => {
          onToggle(field);
        }}
        className={[
          "inline-flex items-center gap-1 rounded-[var(--radius-sm)] uppercase tracking-[0.06em] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(7_81_132_/_24%)]",
          direction ? "text-foreground" : "",
        ].join(" ")}
      >
        {children}

        <span
          aria-hidden="true"
          className={direction ? "" : "opacity-0"}
        >
          {direction === "desc" ? "↓" : "↑"}
        </span>
      </button>
    </th>
  );
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

  // Hasta leer el orden guardado (punto 2) no se consulta, para no pedir
  // la lista dos veces.
  const [isOrderingReady, setIsOrderingReady] =
    useState(false);

  // Con el producto completo, no solo el id: la ventana de etiquetas
  // muestra los seleccionados aunque estén en otras páginas.
  const [
    selectedProducts,
    setSelectedProducts,
  ] = useState<Map<number, Product>>(
    () => new Map<number, Product>(),
  );

  const [
    labelGenerationState,
    setLabelGenerationState,
  ] = useState<LabelGenerationState>({
    status: "idle",
    message: null,
  });

  const [
    isLabelsDialogOpen,
    setIsLabelsDialogOpen,
  ] = useState(false);

  const [
    isProformaFormOpen,
    setIsProformaFormOpen,
  ] = useState(false);

  const [
    proformaState,
    setProformaState,
  ] = useState<ProformaState>({
    status: "idle",
    message: null,
  });

  const hasInventoryAccess =
    user ? canReadProducts(user) : false;

  const hasWriteAccess =
    user ? canWriteProducts(user) : false;

  const hasCustomersAccess =
    user ? canReadCustomers(user) : false;

  const visibleProductIds =
    loadState.status === "success"
      ? loadState.data.results.map(
          (product) => product.id,
        )
      : [];

  const areAllVisibleProductsSelected =
    visibleProductIds.length > 0 &&
    visibleProductIds.every((productId) =>
      selectedProducts.has(productId),
    );

  const areSomeVisibleProductsSelected =
    visibleProductIds.some((productId) =>
      selectedProducts.has(productId),
    );

  // Punto 2: la lista recuerda el último orden elegido. Diferido: setState
  // en un efecto de montaje (regla react-hooks/set-state-in-effect).
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const ordering = readStoredProductOrdering();

      setFilters((current) => ({
        ...current,
        ordering,
      }));
      setIsOrderingReady(true);
    });

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasInventoryAccess ||
      !isOrderingReady
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
    isOrderingReady,
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

  function changeOrdering(
    ordering: ProductOrdering,
  ): void {
    storeProductOrdering(ordering);

    updateFilters((current) => ({
      ...current,
      ordering,
      page: 1,
    }));
  }

  /**
   * Clic en el encabezado de una columna: ordena por ella; si ya era el
   * orden, invierte la dirección.
   */
  function toggleColumnOrdering(
    field: ProductOrderingField,
  ): void {
    const current =
      filters.ordering ?? DEFAULT_PRODUCT_ORDERING;

    changeOrdering({
      field,
      direction:
        current.field === field &&
        current.direction === "asc"
          ? "desc"
          : "asc",
    });
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

  function toggleProductSelection(
    product: Product,
  ): void {
    setSelectedProducts((current) => {
      const next = new Map(current);

      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.set(product.id, product);
      }

      return next;
    });
  }

  function toggleVisibleProducts(): void {
    const visibleProducts =
      loadState.status === "success"
        ? loadState.data.results
        : [];

    setSelectedProducts((current) => {
      const next = new Map(current);

      for (const product of visibleProducts) {
        if (areAllVisibleProductsSelected) {
          next.delete(product.id);
        } else {
          next.set(product.id, product);
        }
      }

      return next;
    });
  }

  function clearProductSelection(): void {
    setSelectedProducts(
      new Map<number, Product>(),
    );
  }

  function openLabelsDialog(): void {
    setLabelGenerationState({
      status: "idle",
      message: null,
    });

    setIsLabelsDialogOpen(true);
  }

  function closeLabelsDialog(): void {
    if (labelGenerationState.status === "generating") {
      return;
    }

    setIsLabelsDialogOpen(false);
  }

  async function handleGenerateLabels(
    items: ProductLabelItem[],
  ): Promise<void> {
    if (!token || items.length === 0) {
      return;
    }

    setLabelGenerationState({
      status: "generating",
      message: null,
    });

    try {
      const blob = await generateProductLabels(
        token,
        items,
      );

      const downloadUrl =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement("a");

      anchor.href = downloadUrl;
      anchor.download =
        "etiquetas-productos.pdf";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      globalThis.setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 1_000);

      setLabelGenerationState({
        status: "idle",
        message: null,
      });

      setIsLabelsDialogOpen(false);
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
        setLabelGenerationState({
          status: "error",
          message:
            "Este usuario no tiene permisos para generar etiquetas.",
        });

        return;
      }

      setLabelGenerationState({
        status: "error",
        message: getLoadErrorMessage(error),
      });
    }
  }

  function openProformaForm(): void {
    setProformaState({
      status: "idle",
      message: null,
    });

    setIsProformaFormOpen(true);
  }

  function closeProformaForm(): void {
    if (proformaState.status === "generating") {
      return;
    }

    setIsProformaFormOpen(false);

    setProformaState({
      status: "idle",
      message: null,
    });
  }

  async function handleCreateProforma(
    customerId: number | null,
    amountSettings: ProformaAmountSettings,
  ): Promise<void> {
    if (
      !token ||
      selectedProducts.size === 0
    ) {
      return;
    }

    setProformaState({
      status: "generating",
      message: null,
    });

    try {
      const blob = await createProforma(
        token,
        Array.from(selectedProducts.keys(), (productId) => ({
          productId,
          quantity: 1,
        })),
        customerId,
        amountSettings,
      );

      const downloadUrl =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement("a");

      anchor.href = downloadUrl;
      anchor.download = "proforma.pdf";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      globalThis.setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 1_000);

      setIsProformaFormOpen(false);

      setProformaState({
        status: "idle",
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
        setProformaState({
          status: "error",
          message:
            "Este usuario no tiene permisos para crear proformas.",
        });

        return;
      }

      setProformaState({
        status: "error",
        message: getLoadErrorMessage(error),
      });
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
        description="Este módulo requiere permisos de productos."
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

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {filters.query ? (
              <div className="flex flex-wrap items-center gap-3">
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
            ) : (
              <span aria-hidden="true" />
            )}

            <div className="flex min-w-0 items-center gap-3 sm:w-[26rem]">
              <label
                htmlFor="products-ordering"
                className="shrink-0 text-sm font-semibold text-muted-foreground"
              >
                Ordenar por
              </label>

              <div className="min-w-0 flex-1">
                <ProductOrderingSelect
                  id="products-ordering"
                  value={
                    filters.ordering ??
                    DEFAULT_PRODUCT_ORDERING
                  }
                  onChange={changeOrdering}
                />
              </div>
            </div>
          </div>
        </div>

        {hasWriteAccess &&
          selectedProducts.size > 0 && (
            <div className="flex flex-col gap-3 border-b border-[var(--color-border-soft)] bg-[var(--color-primary-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {selectedProducts.size}{" "}
                  {selectedProducts.size === 1
                    ? "producto seleccionado"
                    : "productos seleccionados"}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  La selección se mantiene al cambiar
                  de página, de búsqueda o de orden.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={
                    clearProductSelection
                  }
                >
                  Limpiar selección
                </Button>

                <Button
                  type="button"
                  onClick={openLabelsDialog}
                >
                  Generar etiquetas
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={openProformaForm}
                  disabled={
                    isProformaFormOpen ||
                    proformaState.status === "generating"
                  }
                >
                  Crear proforma
                </Button>
              </div>
            </div>
          )}

        <Dialog
          open={isLabelsDialogOpen}
          title="Generar etiquetas"
          description="El código de barras de cada etiqueta es el código propio del producto o, si no tiene, el universal."
          onClose={closeLabelsDialog}
        >
          <ProductLabelsForm
            products={Array.from(
              selectedProducts.values(),
            )}
            initialOrdering={
              filters.ordering ??
              DEFAULT_PRODUCT_ORDERING
            }
            isGenerating={
              labelGenerationState.status ===
              "generating"
            }
            submitError={
              labelGenerationState.status ===
              "error"
                ? labelGenerationState.message
                : null
            }
            onSubmit={handleGenerateLabels}
            onCancel={closeLabelsDialog}
          />
        </Dialog>

        {isProformaFormOpen && selectedProducts.size > 0 && (
          <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-6">
            <div className="mb-5">
              <h3 className="text-base font-semibold text-foreground">
                Crear proforma
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                {selectedProducts.size}{" "}
                {selectedProducts.size === 1
                  ? "producto seleccionado"
                  : "productos seleccionados"}
                . El precio de cada producto es el que aparece en la lista; el
                subtotal, el descuento, el impuesto y el total salen en el PDF.
              </p>
            </div>

            <ProformaForm
              canReadCustomers={hasCustomersAccess}
              canCreateCustomers={user ? canCreateCustomers(user) : false}
              token={token ?? ""}
              isSubmitting={proformaState.status === "generating"}
              submitError={
                proformaState.status === "error"
                  ? proformaState.message
                  : null
              }
              onSubmit={handleCreateProforma}
              onCancel={closeProformaForm}
            />
          </div>
        )}

        {loadState.status === "loading" && (
          <LoadingState message="Consultando productos…" />
        )}

        {loadState.status === "forbidden" && (
          <div className="p-6">
            <StatePanel nested
              title="Acceso restringido"
              message={loadState.message}
              tone="warning"
            />
          </div>
        )}

        {loadState.status === "error" && (
          <div className="p-6">
            <StatePanel nested
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
              <StatePanel nested
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
                <table className="w-full min-w-[960px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      {hasWriteAccess && (
                        <th className="w-14 px-5 py-3.5">
                          <input
                            type="checkbox"
                            checked={
                              areAllVisibleProductsSelected
                            }
                            ref={(element) => {
                              if (element) {
                                element.indeterminate =
                                  areSomeVisibleProductsSelected &&
                                  !areAllVisibleProductsSelected;
                              }
                            }}
                            onChange={
                              toggleVisibleProducts
                            }
                            aria-label="Seleccionar todos los productos visibles"
                            className="size-4 cursor-pointer accent-[var(--color-primary)]"
                          />
                        </th>
                      )}

                      <SortableHeader
                        field="standard_code"
                        ordering={filters.ordering}
                        onToggle={toggleColumnOrdering}
                      >
                        Código
                      </SortableHeader>

                      <SortableHeader
                        field="name"
                        ordering={filters.ordering}
                        onToggle={toggleColumnOrdering}
                      >
                        Producto
                      </SortableHeader>

                      <SortableHeader
                        field="location"
                        ordering={filters.ordering}
                        onToggle={toggleColumnOrdering}
                      >
                        Ubicación
                      </SortableHeader>

                      <SortableHeader
                        field="current_stock"
                        ordering={filters.ordering}
                        onToggle={toggleColumnOrdering}
                        alignRight
                      >
                        Existencia
                      </SortableHeader>

                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Mínimo
                      </th>

                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Precio de venta
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
                            {hasWriteAccess && (
                              <td
                                className="w-14 px-5 py-4 align-top"
                                onClick={(event) => {
                                  event.stopPropagation();
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedProducts.has(
                                    product.id,
                                  )}
                                  onChange={() => {
                                    toggleProductSelection(
                                      product,
                                    );
                                  }}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                  }}
                                  onKeyDown={(event) => {
                                    event.stopPropagation();
                                  }}
                                  aria-label={`Seleccionar ${product.standard_code}, ${product.name}`}
                                  className="size-4 cursor-pointer accent-[var(--color-primary)]"
                                />
                              </td>
                            )}

                            <td className="px-5 py-4 align-top">
                              <span className="font-mono text-sm font-semibold text-foreground">
                                {product.standard_code}
                              </span>

                              {product.variant_kind !== "ORIGINAL" && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                  {VARIANT_KIND_LABELS[product.variant_kind]}
                                </span>
                              )}

                              {product.own_code && (
                                <p
                                  className="mt-1 font-mono text-xs text-muted-foreground"
                                  title="Código propio"
                                >
                                  Propio: {product.own_code}
                                </p>
                              )}
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

                            <td className="px-5 py-4 text-right align-top">
                              {product.effective_sale_price ? (
                                <span className="font-mono text-sm font-semibold text-foreground">
                                  ₡{formatMoney(
                                    product.effective_sale_price,
                                  )}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  —
                                </span>
                              )}
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
