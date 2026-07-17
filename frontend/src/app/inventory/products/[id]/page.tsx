"use client";

import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

import {
  canReadInventory,
  canWriteInventory,
} from "@/features/auth/permissions";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import {
  getProduct,
  getProductReferences,
} from "@/features/inventory/products/api";
import type {
  Product,
  ProductReference,
} from "@/features/inventory/products/types";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      product: null;
      references: [];
      message: null;
    }
  | {
      status: "success";
      product: Product;
      references: ProductReference[];
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      product: null;
      references: [];
      message: string;
    };

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
      references: [],
      message: null,
    });

  const productId = Number(params.id);

  const hasInventoryAccess =
    user ? canReadInventory(user) : false;

  const hasWriteAccess =
    user ? canWriteInventory(user) : false;

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

    Promise.all([
      getProduct(
        token,
        productId,
        controller.signal,
      ),
      getProductReferences(
        token,
        productId,
        controller.signal,
      ),
    ])
      .then(([product, references]) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({
          status: "success",
          product,
          references: references.results,
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
          setLoadState({
            status: "forbidden",
            product: null,
            references: [],
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
            references: [],
            message:
              "El producto solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          product: null,
          references: [],
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
        description="Este módulo requiere permisos de inventario."
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

          <section className="app-status-card overflow-hidden xl:col-span-2">
            <div className="border-b border-[var(--color-border-soft)] p-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Referencias equivalentes
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Códigos comerciales y fabricantes asociados.
              </p>
            </div>

            {loadState.references.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Este producto no tiene referencias equivalentes registradas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Referencia
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Fabricante
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Descripción
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Estado
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {loadState.references.map(
                      (reference) => (
                        <tr
                          key={reference.id}
                          className="border-b border-[var(--color-border-soft)] last:border-b-0"
                        >
                          <td className="px-5 py-4 font-mono text-sm font-semibold text-foreground">
                            {reference.reference_code}
                          </td>

                          <td className="px-5 py-4 text-sm text-foreground">
                            {reference.manufacturer ||
                              "Sin fabricante"}
                          </td>

                          <td className="px-5 py-4 text-sm text-muted-foreground">
                            {reference.description ||
                              "Sin descripción"}
                          </td>

                          <td className="px-5 py-4">
                            {reference.is_active
                              ? "Activa"
                              : "Inactiva"}
                          </td>
                        </tr>
                      ),
                    )}
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