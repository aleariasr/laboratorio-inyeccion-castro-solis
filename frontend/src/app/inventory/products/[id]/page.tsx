"use client";

import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  canReadProducts,
  canWriteProducts,
} from "@/features/auth/permissions";

import { LoadingState } from "@/components/feedback/loading-state";
import { FormError } from "@/components/feedback/form-error";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import {
  addProductVariant,
  getProduct,
  getProductStockMovements,
  getProductVariants,
  updateProductSalePrice,
} from "@/features/inventory/products/api";
import { Input } from "@/components/ui/input";
import { ProductVariantForm } from "@/features/inventory/products/product-variant-form";
import { mapProductVariantApiFieldErrors } from "@/features/inventory/products/form-errors";
import {
  buildProductVariantWritePayload,
  emptyProductVariantFormValues,
  VARIANT_KIND_LABELS,
  type Product,
  type ProductVariantFormErrors,
  type ProductVariantFormValues,
  type StockMovement,
} from "@/features/inventory/products/types";
import { getLatestProductCostHistory } from "@/features/inventory/purchases/api";
import { crcEquivalent, formatMoney } from "@/features/inventory/purchases/format";
import type { ProductCostHistory } from "@/features/inventory/purchases/types";
import { useRecordRecentlyViewed } from "@/features/recently-viewed/use-record-recently-viewed";
import type { PaginatedResponse } from "@/lib/api/types";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      product: null;
      variants: [];
      message: null;
    }
  | {
      status: "success";
      product: Product;
      variants: Product[];
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      product: null;
      variants: [];
      message: string;
    };

type VariantFormState = {
  mode: "closed" | "create";
};

type VariantActionState = {
  isSubmitting: boolean;
  submitError: string | null;
  fieldErrors: ProductVariantFormErrors;
};

type SalePriceEditState = {
  isEditing: boolean;
  value: string;
  isSubmitting: boolean;
  error: string | null;
};

type MovementLoadState =
  | {
      status: "loading";
      data: null;
      message: null;
    }
  | {
      status: "success";
      data: PaginatedResponse<StockMovement>;
      message: null;
    }
  | {
      status: "forbidden" | "error";
      data: null;
      message: string;
    };

const MOVEMENTS_PAGE_SIZE = 10;

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La consulta tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible consultar el producto.";
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(date);
}

function formatSignedQuantity(
  movement: StockMovement,
): string {
  const prefix =
    movement.direction === "IN"
      ? "+"
      : "-";

  return `${prefix}${movement.quantity}`;
}

function getMovementReference(
  movement: StockMovement,
): string {
  if (movement.purchase_invoice_number) {
    return `Compra ${movement.purchase_invoice_number}`;
  }

  if (movement.sale_id !== null) {
    return `Venta #${movement.sale_id}`;
  }

  if (movement.inventory_count_reference) {
    return `Conteo ${movement.inventory_count_reference}`;
  }

  if (
    movement.reverses_movement !== null
  ) {
    return `Revierte movimiento #${movement.reverses_movement}`;
  }

  return "Sin documento asociado";
}

function isLowStock(product: Product): boolean {
  return (
    product.is_active &&
    product.current_stock <= product.minimum_stock
  );
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const {
    status: authStatus,
    user,
    token,
    logout,
  } = useAuth();

  const [loadState, setLoadState] =
    useState<LoadState>({
      status: "loading",
      product: null,
      variants: [],
      message: null,
    });
  const [
    variantFormState,
    setVariantFormState,
  ] = useState<VariantFormState>({
    mode: "closed",
  });

  const [
    variantActionState,
    setVariantActionState,
  ] = useState<VariantActionState>({
    isSubmitting: false,
    submitError: null,
    fieldErrors: {},
  });

  const [
    movementPage,
    setMovementPage,
  ] = useState(1);

  const [
    movementReloadKey,
    setMovementReloadKey,
  ] = useState(0);

  const [
    movementLoadState,
    setMovementLoadState,
  ] = useState<MovementLoadState>({
    status: "loading",
    data: null,
    message: null,
  });

  const [
    costHistory,
    setCostHistory,
  ] = useState<ProductCostHistory | null>(null);

  const [salePriceState, setSalePriceState] =
    useState<SalePriceEditState>({
      isEditing: false,
      value: "",
      isSubmitting: false,
      error: null,
    });

  const productId = Number(params.id);

  const hasInventoryAccess =
    user ? canReadProducts(user) : false;

  const hasWriteAccess =
    user ? canWriteProducts(user) : false;

  useRecordRecentlyViewed(
    loadState.status === "success"
      ? {
          type: "product",
          id: loadState.product.id,
          label: `${loadState.product.standard_code} · ${loadState.product.name}`,
          href: `/inventory/products/${loadState.product.id}`,
        }
      : null,
  );

  const movementTotalPages =
    movementLoadState.status === "success"
      ? Math.max(
          1,
          Math.ceil(
            movementLoadState.data.count /
              MOVEMENTS_PAGE_SIZE,
          ),
        )
      : 1;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasInventoryAccess ||
      !Number.isInteger(productId) ||
      productId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getProduct(
      token,
      productId,
      controller.signal,
    )
      .then((product) =>
        Promise.all([
          Promise.resolve(product),
          getProductVariants(
            token,
            product.standard_code,
            product.id,
            controller.signal,
          ),
          getLatestProductCostHistory(
            token,
            productId,
            controller.signal,
          ).catch(() => null),
        ]),
      )
      .then(([product, variants, latestCostHistory]) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({
          status: "success",
          product,
          variants,
          message: null,
        });

        setCostHistory(latestCostHistory);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
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
            product: null,
            variants: [],
            message:
              "Este usuario no tiene permisos para consultar el inventario.",
          });

          return;
        }

        if (
          error instanceof ApiError &&
          error.status === 404
        ) {
          setLoadState({
            status: "not-found",
            product: null,
            variants: [],
            message:
              "El producto solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          product: null,
          variants: [],
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    authStatus,
    hasInventoryAccess,
    logout,
    productId,
    router,
    token,
  ]);

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasInventoryAccess ||
      !Number.isInteger(productId) ||
      productId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    setMovementLoadState({
      status: "loading",
      data: null,
      message: null,
    });

    getProductStockMovements(
      token,
      productId,
      movementPage,
      MOVEMENTS_PAGE_SIZE,
      controller.signal,
    )
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        setMovementLoadState({
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
          setMovementLoadState({
            status: "forbidden",
            data: null,
            message:
              "Este usuario no tiene permisos para consultar movimientos de inventario.",
          });

          return;
        }

        setMovementLoadState({
          status: "error",
          data: null,
          message:
            error instanceof ApiError
              ? error.message
              : getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    authStatus,
    hasInventoryAccess,
    logout,
    movementPage,
    movementReloadKey,
    productId,
    router,
    token,
  ]);

  function openCreateVariantForm(): void {
    setVariantActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
    });

    setVariantFormState({
      mode: "create",
    });
  }

  function closeVariantForm(): void {
    if (variantActionState.isSubmitting) {
      return;
    }

    setVariantFormState({
      mode: "closed",
    });

    setVariantActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
    });
  }

  function addVariantToState(newVariant: Product): void {
    setLoadState((current) => {
      if (current.status !== "success") {
        return current;
      }

      const variants = [...current.variants, newVariant];

      variants.sort((left, right) =>
        left.name.localeCompare(right.name, "es", {
          sensitivity: "base",
          numeric: true,
        }),
      );

      return {
        ...current,
        variants,
      };
    });
  }

  async function handleVariantSubmit(
    values: ProductVariantFormValues,
  ): Promise<void> {
    if (!token || loadState.status !== "success") {
      return;
    }

    setVariantActionState((current) => ({
      ...current,
      isSubmitting: true,
      submitError: null,
      fieldErrors: {},
    }));

    try {
      const payload = buildProductVariantWritePayload(values);

      const newVariant = await addProductVariant(
        token,
        loadState.product.id,
        payload,
      );

      addVariantToState(newVariant);

      setVariantFormState({
        mode: "closed",
      });

      setVariantActionState({
        isSubmitting: false,
        submitError: null,
        fieldErrors: {},
      });
    } catch (error: unknown) {
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
        setVariantActionState((current) => ({
          ...current,
          isSubmitting: false,
          submitError:
            "Este usuario no tiene permisos para agregar variantes.",
        }));

        return;
      }

      if (error instanceof ApiError) {
        const fieldErrors = mapProductVariantApiFieldErrors(
          error.fieldErrors,
        );

        setVariantActionState((current) => ({
          ...current,
          isSubmitting: false,
          submitError:
            Object.keys(fieldErrors).length > 0
              ? null
              : error.message,
          fieldErrors,
        }));

        return;
      }

      setVariantActionState((current) => ({
        ...current,
        isSubmitting: false,
        submitError: getErrorMessage(error),
      }));
    }
  }

  function openEditSalePrice(): void {
    if (loadState.status !== "success") {
      return;
    }

    setSalePriceState({
      isEditing: true,
      value: loadState.product.custom_sale_price ?? "",
      isSubmitting: false,
      error: null,
    });
  }

  function closeEditSalePrice(): void {
    if (salePriceState.isSubmitting) {
      return;
    }

    setSalePriceState({
      isEditing: false,
      value: "",
      isSubmitting: false,
      error: null,
    });
  }

  async function handleSalePriceSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!token || loadState.status !== "success") {
      return;
    }

    const trimmedValue = salePriceState.value.trim();

    if (
      trimmedValue &&
      (!DECIMAL_PATTERN.test(trimmedValue) ||
        Number(trimmedValue) <= 0)
    ) {
      setSalePriceState((current) => ({
        ...current,
        error: "Ingrese un precio válido mayor que cero, o déjelo vacío.",
      }));

      return;
    }

    setSalePriceState((current) => ({
      ...current,
      isSubmitting: true,
      error: null,
    }));

    try {
      const updatedProduct = await updateProductSalePrice(
        token,
        loadState.product.id,
        trimmedValue ? trimmedValue : null,
      );

      setLoadState((current) => {
        if (current.status !== "success") {
          return current;
        }

        return { ...current, product: updatedProduct };
      });

      setSalePriceState({
        isEditing: false,
        value: "",
        isSubmitting: false,
        error: null,
      });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para editar el precio de venta."
          : getErrorMessage(error);

      setSalePriceState((current) => ({
        ...current,
        isSubmitting: false,
        error: message,
      }));
    }
  }

  function goBack(): void {
    router.back();
  }

  if (
    !Number.isInteger(productId) ||
    productId <= 0
  ) {
    return (
      <AppShell
        title="Producto no válido"
        description="La dirección proporcionada no identifica un producto."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al catálogo y seleccione un producto válido."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace(
                  "/inventory/products",
                );
              }}
            >
              Volver a productos
            </Button>
          }
        />
      </AppShell>
    );
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
          title="No tiene acceso al producto"
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
      title={
        loadState.status === "success"
          ? loadState.product.name
          : "Detalle de producto"
      }
      description={
        loadState.status === "success"
          ? loadState.product.standard_code
          : "Información registrada del producto."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {loadState.status === "success" &&
            hasWriteAccess && (
              <Button
                type="button"
                onClick={() => {
                  router.push(
                    `/inventory/products/${loadState.product.id}/edit`,
                  );
                }}
              >
                Editar producto
              </Button>
            )}

          <Button
            type="button"
            variant="secondary"
            onClick={goBack}
          >
            <ArrowLeftIcon />
            Volver
          </Button>
        </div>
      }
    >
      {loadState.status === "loading" && (
        <LoadingState message="Consultando producto…" />
      )}

      {loadState.status === "forbidden" && (
        <StatePanel
          title="Acceso restringido"
          message={loadState.message}
          tone="warning"
        />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Producto no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace(
                  "/inventory/products",
                );
              }}
            >
              Volver al catálogo
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el producto"
          message={loadState.message}
          tone="error"
          action={
            <Button
              type="button"
              onClick={() => {
                globalThis.location.reload();
              }}
            >
              Reintentar
            </Button>
          }
        />
      )}

      {loadState.status === "success" && (
        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-sm font-semibold text-primary">
                  {loadState.product.standard_code}
                </p>

                <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-foreground">
                  {loadState.product.name}
                </h2>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {loadState.product.description ||
                    "Sin descripción registrada."}
                </p>
              </div>

              <span
                className={[
                  "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                  loadState.product.is_active
                    ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                    : "bg-surface-muted text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "size-1.5 rounded-full",
                    loadState.product.is_active
                      ? "bg-[var(--color-success)]"
                      : "bg-[var(--color-text-subtle)]",
                  ].join(" ")}
                  aria-hidden="true"
                />

                {loadState.product.is_active
                  ? "Activo"
                  : "Inactivo"}
              </span>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Tipo de variante</dt>
                <dd>
                  {VARIANT_KIND_LABELS[loadState.product.variant_kind]}
                </dd>
              </div>

              <div className="app-status-row">
                <dt>Ubicación principal</dt>

                <dd>
                  <span className="font-mono">
                    {
                      loadState.product
                        .storage_location_detail.code
                    }
                  </span>

                  {loadState.product
                    .storage_location_detail
                    .description && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {
                        loadState.product
                          .storage_location_detail
                          .description
                      }
                    </span>
                  )}
                </dd>
              </div>

              <div className="app-status-row">
                <dt>Unidad de medida</dt>
                <dd>
                  {loadState.product.unit_of_measure}
                </dd>
              </div>

              <div className="app-status-row">
                <dt>Fecha de creación</dt>
                <dd>
                  {formatDate(
                    loadState.product.created_at,
                  )}
                </dd>
              </div>

              <div className="app-status-row">
                <dt>Última modificación</dt>
                <dd>
                  {formatDate(
                    loadState.product.updated_at,
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="app-status-card p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Existencias
            </h2>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
                <p className="text-sm text-muted-foreground">
                  Actual
                </p>

                <p
                  className={[
                    "mt-2 font-mono text-2xl font-semibold",
                    isLowStock(loadState.product)
                      ? "text-[var(--color-warning)]"
                      : "text-foreground",
                  ].join(" ")}
                >
                  {loadState.product.current_stock}
                </p>
              </div>

              <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
                <p className="text-sm text-muted-foreground">
                  Mínimo
                </p>

                <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
                  {loadState.product.minimum_stock}
                </p>
              </div>
            </div>

            {isLowStock(loadState.product) && (
              <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-warning-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-warning)]">
                La existencia actual alcanzó o está por debajo del mínimo.
              </div>
            )}

            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              El stock se calcula desde movimientos y no puede editarse directamente.
            </p>
          </section>

          <section className="app-status-card p-6 xl:col-span-2">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Costos y precio
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Últimos valores calculados a partir de la compra más reciente con costos aplicados.
            </p>

            <div className="mt-6 rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] p-4 ring-1 ring-[rgb(7_81_132_/_12%)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Precio de venta
                  </p>

                  <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
                    {loadState.product.effective_sale_price
                      ? `₡${formatMoney(loadState.product.effective_sale_price)}`
                      : "No definido"}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {loadState.product.custom_sale_price
                      ? "Definido manualmente."
                      : "Tomado del último precio sugerido calculado en una compra."}
                  </p>
                </div>

                {hasWriteAccess && !salePriceState.isEditing && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={openEditSalePrice}
                  >
                    Editar
                  </Button>
                )}
              </div>

              {salePriceState.isEditing && (
                <form
                  onSubmit={handleSalePriceSubmit}
                  noValidate
                  className="mt-4 flex flex-wrap items-start gap-3"
                >
                  <div className="min-w-[200px] flex-1">
                    <Input
                      id="product-sale-price"
                      value={salePriceState.value}
                      onChange={(event) => {
                        const nextValue = event.target.value;

                        setSalePriceState((current) => ({
                          ...current,
                          value: nextValue,
                          error: null,
                        }));
                      }}
                      hasError={Boolean(salePriceState.error)}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="Vacío = usar el precio sugerido"
                      disabled={salePriceState.isSubmitting}
                      autoFocus
                    />

                    {salePriceState.error && (
                      <p className="mt-1 text-xs text-[var(--color-danger)]">
                        {salePriceState.error}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      isLoading={salePriceState.isSubmitting}
                      loadingText="Guardando…"
                    >
                      Guardar
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={closeEditSalePrice}
                      disabled={salePriceState.isSubmitting}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {costHistory ? (
              <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
                  <dt className="text-sm text-muted-foreground">
                    Precio sin costos
                  </dt>
                  <dd className="mt-2 font-mono text-lg font-semibold text-foreground">
                    {formatMoney(costHistory.original_unit_cost)} {costHistory.currency}
                  </dd>
                  {costHistory.currency === "USD" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {crcEquivalent(costHistory.original_unit_cost, costHistory.exchange_rate)}
                    </p>
                  )}
                </div>

                <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
                  <dt className="text-sm text-muted-foreground">
                    Último precio de costo
                  </dt>
                  <dd className="mt-2 font-mono text-lg font-semibold text-foreground">
                    {formatMoney(costHistory.final_unit_cost)} {costHistory.currency}
                  </dd>
                  {costHistory.currency === "USD" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {crcEquivalent(costHistory.final_unit_cost, costHistory.exchange_rate)}
                    </p>
                  )}
                </div>

                <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
                  <dt className="text-sm text-muted-foreground">
                    Precio de venta sugerido
                  </dt>
                  <dd className="mt-2 font-mono text-lg font-semibold text-foreground">
                    {costHistory.suggested_price
                      ? `${formatMoney(costHistory.suggested_price)} ${costHistory.currency}`
                      : "No calculado"}
                  </dd>
                  {costHistory.currency === "USD" && costHistory.suggested_price && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {crcEquivalent(costHistory.suggested_price, costHistory.exchange_rate)}
                    </p>
                  )}
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Este producto todavía no tiene costos calculados a partir de una compra.
              </p>
            )}
          </section>

          <section className="app-status-card overflow-hidden xl:col-span-2">
            <div className="flex flex-col gap-2 border-b border-[var(--color-border-soft)] p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  Historial de movimientos
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Entradas, salidas, ajustes y reversiones
                  que determinan la existencia actual.
                </p>
              </div>

              {movementLoadState.status ===
                "success" && (
                <p className="text-sm text-muted-foreground">
                  {movementLoadState.data.count}{" "}
                  {movementLoadState.data.count === 1
                    ? "movimiento"
                    : "movimientos"}
                </p>
              )}
            </div>

            {movementLoadState.status ===
              "loading" && (
              <div className="p-6">
                <LoadingState message="Consultando movimientos…" />
              </div>
            )}

            {movementLoadState.status ===
              "forbidden" && (
              <div className="p-6">
                <StatePanel
                  title="Movimientos restringidos"
                  message={movementLoadState.message}
                  tone="warning"
                />
              </div>
            )}

            {movementLoadState.status ===
              "error" && (
              <div className="p-6">
                <StatePanel
                  title="No se pudo cargar el historial"
                  message={movementLoadState.message}
                  tone="error"
                  action={
                    <Button
                      type="button"
                      onClick={() => {
                        setMovementReloadKey(
                          (current) => current + 1,
                        );
                      }}
                    >
                      Reintentar
                    </Button>
                  }
                />
              </div>
            )}

            {movementLoadState.status ===
              "success" &&
              movementLoadState.data.results.length ===
                0 && (
                <div className="p-6">
                  <p className="text-sm text-muted-foreground">
                    Este producto todavía no tiene
                    movimientos de inventario registrados.
                  </p>
                </div>
              )}

            {movementLoadState.status ===
              "success" &&
              movementLoadState.data.results.length >
                0 && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                          <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Fecha
                          </th>

                          <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Tipo
                          </th>

                          <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Cantidad
                          </th>

                          <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Documento
                          </th>

                          <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Notas
                          </th>

                          <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Usuario
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {movementLoadState.data.results.map(
                          (movement) => (
                            <tr
                              key={movement.id}
                              className="border-b border-[var(--color-border-soft)] last:border-b-0"
                            >
                              <td className="whitespace-nowrap px-5 py-4 text-sm text-foreground">
                                {formatDate(
                                  movement.created_at,
                                )}
                              </td>

                              <td className="px-5 py-4">
                                <div className="flex flex-col gap-1">
                                  <span className="text-sm font-semibold text-foreground">
                                    {
                                      movement.movement_type_display
                                    }
                                  </span>

                                  <span className="text-xs text-muted-foreground">
                                    {
                                      movement.direction_display
                                    }
                                  </span>
                                </div>
                              </td>

                              <td className="px-5 py-4">
                                <span
                                  className={[
                                    "font-mono text-sm font-semibold",
                                    movement.direction ===
                                    "IN"
                                      ? "text-[var(--color-success)]"
                                      : "text-[var(--color-danger)]",
                                  ].join(" ")}
                                >
                                  {formatSignedQuantity(
                                    movement,
                                  )}
                                </span>
                              </td>

                              <td className="px-5 py-4 text-sm text-foreground">
                                {getMovementReference(
                                  movement,
                                )}
                              </td>

                              <td className="max-w-md px-5 py-4 text-sm leading-6 text-muted-foreground">
                                {movement.notes ||
                                  "Sin notas"}
                              </td>

                              <td className="px-5 py-4 text-sm text-muted-foreground">
                                {movement.created_by_username ||
                                  "Sistema"}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-[var(--color-border-soft)] p-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      Página {movementPage} de{" "}
                      {movementTotalPages}
                    </p>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          movementLoadState.data.previous ===
                          null
                        }
                        onClick={() => {
                          setMovementPage((current) =>
                            Math.max(1, current - 1),
                          );
                        }}
                      >
                        Anterior
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          movementLoadState.data.next ===
                          null
                        }
                        onClick={() => {
                          setMovementPage((current) =>
                            Math.min(
                              movementTotalPages,
                              current + 1,
                            ),
                          );
                        }}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                </>
              )}
          </section>

          <section className="app-status-card overflow-hidden xl:col-span-2">
            <div className="flex flex-col gap-4 border-b border-[var(--color-border-soft)] p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  Variantes de este código
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Otros productos (original/genérico) que comparten el
                  código estándar {loadState.product.standard_code} y su
                  ubicación.
                </p>
              </div>

              {hasWriteAccess &&
                variantFormState.mode === "closed" && (
                  <Button
                    type="button"
                    onClick={openCreateVariantForm}
                  >
                    Agregar variante
                  </Button>
                )}
            </div>

            {variantActionState.submitError &&
              variantFormState.mode === "closed" && (
                <div className="border-b border-[var(--color-border-soft)] p-6">
                  <FormError
                    message={variantActionState.submitError}
                  />
                </div>
              )}

            {variantFormState.mode !== "closed" && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-6">
                <div className="mb-5">
                  <h3 className="text-base font-semibold text-foreground">
                    Nueva variante
                  </h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Registre un producto distinto (con su propio precio y
                    stock) para la misma pieza.
                  </p>
                </div>

                <ProductVariantForm
                  parent={loadState.product}
                  initialValues={emptyProductVariantFormValues(
                    loadState.product,
                  )}
                  isSubmitting={variantActionState.isSubmitting}
                  submitError={variantActionState.submitError}
                  serverErrors={variantActionState.fieldErrors}
                  onSubmit={handleVariantSubmit}
                  onCancel={closeVariantForm}
                />
              </div>
            )}

            {loadState.variants.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Este producto no tiene otras variantes registradas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Nombre
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Tipo
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Precio
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Existencia
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Estado
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {loadState.variants.map((variant) => (
                      <tr
                        key={variant.id}
                        onClick={() => {
                          router.push(
                            `/inventory/products/${variant.id}`,
                          );
                        }}
                        className="cursor-pointer border-b border-[var(--color-border-soft)] last:border-b-0 hover:bg-surface-muted/50"
                      >
                        <td className="px-5 py-4 text-sm font-semibold text-foreground">
                          {variant.name}
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">
                          {VARIANT_KIND_LABELS[variant.variant_kind]}
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">
                          {variant.effective_sale_price
                            ? `₡${formatMoney(
                                Number(variant.effective_sale_price),
                              )}`
                            : "Sin precio"}
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">
                          {variant.current_stock}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                              variant.is_active
                                ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                                : "bg-surface-muted text-muted-foreground",
                            ].join(" ")}
                          >
                            {variant.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
