"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { LayersIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canReadInventory } from "@/features/auth/permissions";
import { getStockByLocationReport } from "@/features/inventory/reports/api";
import type { StockByLocationReport } from "@/features/inventory/reports/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: StockByLocationReport }
  | { status: "forbidden" | "error"; message: string };

function getLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La consulta tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible consultar el stock por ubicación.";
}

function isLowStock(product: { current_stock: number; minimum_stock: number }): boolean {
  return product.current_stock <= product.minimum_stock;
}

export default function StockByLocationPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [reloadKey, setReloadKey] = useState(0);

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const hasInventoryAccess = user ? canReadInventory(user) : false;

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasInventoryAccess) {
      return;
    }

    const controller = new AbortController();

    getStockByLocationReport(token, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          void logout().then(() => {
            router.replace("/login");
          });

          return;
        }

        if (error instanceof ApiError && error.status === 403) {
          setLoadState({
            status: "forbidden",
            message: "Este usuario no tiene permisos para consultar reportes de inventario.",
          });

          return;
        }

        setLoadState({ status: "error", message: getLoadErrorMessage(error) });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasInventoryAccess, logout, reloadKey, router, token]);

  function handleRetry(): void {
    setLoadState({ status: "loading" });
    setReloadKey((current) => current + 1);
  }

  if (authStatus === "authenticated" && user && !hasInventoryAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de inventario."
      >
        <StatePanel
          title="No tiene acceso a reportes de inventario"
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
      title="Stock por ubicación"
      description="Existencias actuales agrupadas por ubicación de almacenamiento."
    >
      {loadState.status === "loading" && (
        <div className="rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]">
          <LoadingState message="Consultando existencias…" />
        </div>
      )}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el reporte"
          message={loadState.message}
          tone="error"
          action={
            <Button type="button" onClick={handleRetry}>
              Reintentar
            </Button>
          }
        />
      )}

      {loadState.status === "success" && loadState.data.results.length === 0 && (
        <StatePanel
          title="Sin ubicaciones registradas"
          message="El sistema todavía no tiene ubicaciones de almacenamiento con productos."
          icon={<LayersIcon />}
        />
      )}

      {loadState.status === "success" && loadState.data.results.length > 0 && (
        <div className="flex flex-col gap-5">
          {loadState.data.results.map((location) => (
            <section
              key={location.id}
              className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]"
              aria-labelledby={`location-${location.id}-title`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-soft)] p-5 sm:p-6">
                <div>
                  <h2
                    id={`location-${location.id}-title`}
                    className="text-lg font-semibold tracking-[-0.02em] text-foreground"
                  >
                    <Link href={`/inventory/locations/${location.id}`} className="hover:underline">
                      {location.code}
                    </Link>
                  </h2>

                  {location.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{location.description}</p>
                  )}
                </div>

                <span className="inline-flex items-center rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground">
                  Total: {location.total_stock}
                </span>
              </div>

              {location.products.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  Sin productos registrados en esta ubicación.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                        <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Producto
                        </th>

                        <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Stock actual
                        </th>

                        <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Mínimo
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {location.products.map((product) => (
                        <tr
                          key={product.id}
                          className="border-b border-[var(--color-border-soft)] last:border-b-0"
                        >
                          <td className="px-5 py-4 align-top text-sm">
                            <Link
                              href={`/inventory/products/${product.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              <span className="font-mono">{product.standard_code}</span>
                              <span className="ml-2">{product.name}</span>
                            </Link>
                          </td>

                          <td className="px-5 py-4 align-top text-sm">
                            <span
                              className={[
                                "font-semibold",
                                isLowStock(product) ? "text-danger" : "text-foreground",
                              ].join(" ")}
                            >
                              {product.current_stock}
                            </span>

                            {isLowStock(product) && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-[var(--color-danger-soft)] px-2.5 py-1 text-xs font-semibold text-danger">
                                Stock bajo
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                            {product.minimum_stock}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
