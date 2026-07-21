"use client";

import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { Pagination } from "@/components/data-display/pagination";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import {
  ArrowLeftIcon,
  BoxIcon,
} from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import {
  canReadInventory,
  canWriteInventory,
} from "@/features/auth/permissions";
import { getStorageLocation } from "@/features/inventory/locations/api";
import type { StorageLocation } from "@/features/inventory/locations/types";
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
      location: null;
      products: null;
      message: null;
    }
  | {
      status: "success";
      location: StorageLocation;
      products: PaginatedResponse<Product>;
      message: null;
    }
  | {
      status:
        | "not-found"
        | "forbidden"
        | "error";
      location: null;
      products: null;
      message: string;
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

  return "No fue posible consultar la ubicación.";
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

export default function StorageLocationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const {
    status: authStatus,
    user,
    token,
    logout,
  } = useAuth();

  const locationId = Number(params.id);

  const locationCacheRef = useRef<{
    locationId: number;
    location: StorageLocation;
    } | null>(null);

  const [page, setPage] = useState(1);

  const [loadState, setLoadState] =
    useState<LoadState>({
      status: "loading",
      location: null,
      products: null,
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
      !hasInventoryAccess ||
      !Number.isInteger(locationId) ||
      locationId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    const productFilters: ProductFilters = {
      query: "",
      activeState: "all",
      storageLocationId: locationId,
      page,
      pageSize: 50,
    };

    const cachedLocation =
        locationCacheRef.current?.locationId ===
        locationId
            ? locationCacheRef.current.location
            : null;

        const locationRequest = cachedLocation
        ? Promise.resolve(cachedLocation)
        : getStorageLocation(
            token,
            locationId,
            controller.signal,
            );

        Promise.all([
        locationRequest,
        getProducts(
            token,
            productFilters,
            controller.signal,
        ),
        ])
        .then(([location, products]) => {
            if (controller.signal.aborted) {
            return;
            }

            locationCacheRef.current = {
            locationId,
            location,
            };

            setLoadState({
            status: "success",
            location,
            products,
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
            location: null,
            products: null,
            message:
              "Este usuario no tiene permisos para consultar esta ubicación.",
          });

          return;
        }

        if (
          error instanceof ApiError &&
          error.status === 404
        ) {
          setLoadState({
            status: "not-found",
            location: null,
            products: null,
            message:
              "La ubicación solicitada no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          location: null,
          products: null,
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    authStatus,
    hasInventoryAccess,
    locationId,
    logout,
    page,
    router,
    token,
  ]);

  function returnToLocations(): void {
    router.push("/inventory/locations");
  }

  function openProduct(productId: number): void {
    router.push(
      `/inventory/products/${productId}`,
    );
  }

  function openEditPage(): void {
    router.push(
      `/inventory/locations/${locationId}/edit`,
    );
  }

  function handleProductKeyDown(
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    productId: number,
  ): void {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    openProduct(productId);
  }

  if (
    !Number.isInteger(locationId) ||
    locationId <= 0
  ) {
    return (
      <AppShell
        title="Ubicación no válida"
        description="La dirección proporcionada no identifica una ubicación."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione una ubicación válida."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace(
                  "/inventory/locations",
                );
              }}
            >
              Volver a ubicaciones
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
          title="No tiene acceso a ubicaciones"
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
          ? `Ubicación ${loadState.location.code}`
          : "Detalle de ubicación"
      }
      description={
        loadState.status === "success"
          ? loadState.location.description ||
            "Ubicación física del inventario."
          : "Consulte los productos asignados a esta ubicación."
      }
      actions={
        loadState.status === "success" ? (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={returnToLocations}
            >
              <ArrowLeftIcon />
              Volver
            </Button>

            {hasWriteAccess && (
              <Button
                type="button"
                onClick={openEditPage}
              >
                Editar ubicación
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {loadState.status === "loading" && (
        <LoadingState message="Consultando ubicación y productos…" />
      )}

      {loadState.status === "forbidden" && (
        <StatePanel
          title="Acceso restringido"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={returnToLocations}
            >
              Volver a ubicaciones
            </Button>
          }
        />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Ubicación no encontrada"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={returnToLocations}
            >
              Volver a ubicaciones
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar la ubicación"
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
        <div className="grid gap-6">
          <section className="app-status-card p-6">
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Código
                </p>

                <p className="mt-2 font-mono text-lg font-semibold text-foreground">
                  {loadState.location.code}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Estado
                </p>

                <div className="mt-2">
                  <span
                    className={[
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                      loadState.location.is_active
                        ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                        : "bg-surface-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "size-1.5 rounded-full",
                        loadState.location.is_active
                          ? "bg-[var(--color-success)]"
                          : "bg-[var(--color-text-subtle)]",
                      ].join(" ")}
                      aria-hidden="true"
                    />

                    {loadState.location.is_active
                      ? "Activa"
                      : "Inactiva"}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Productos asignados
                </p>

                <p className="mt-2 text-lg font-semibold text-foreground">
                  {loadState.products.count}
                </p>
              </div>
            </div>
          </section>

          <section
            className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
            aria-labelledby="location-products-title"
          >
            <div className="border-b border-[var(--color-border-soft)] p-6">
              <h2
                id="location-products-title"
                className="text-lg font-semibold tracking-[-0.02em] text-foreground"
              >
                Productos en esta ubicación
              </h2>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Existencias actuales, mínimos y estado operativo.
              </p>
            </div>

            {loadState.products.results.length === 0 ? (
              <div className="p-6">
                <StatePanel
                  title="No hay productos asignados"
                  message="Esta ubicación todavía no tiene productos asociados."
                  icon={<BoxIcon />}
                />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                        <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Código
                        </th>

                        <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Producto
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
                      {loadState.products.results.map(
                        (product) => {
                          const lowStock =
                            isLowStock(product);

                          return (
                            <tr
                              key={product.id}
                              tabIndex={0}
                              role="link"
                              aria-label={`Abrir producto ${product.standard_code}, ${product.name}`}
                              onClick={() => {
                                openProduct(product.id);
                              }}
                              onKeyDown={(event) => {
                                handleProductKeyDown(
                                  event,
                                  product.id,
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
                  page={page}
                  pageSize={50}
                  totalItems={loadState.products.count}
                  hasNextPage={
                    loadState.products.next !== null
                  }
                  hasPreviousPage={
                    loadState.products.previous !== null
                  }
                  onPageChange={(nextPage) => {
                    setPage(nextPage);
                  }}
                />
              </>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
