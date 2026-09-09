"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import {
  AlertIcon,
  CartIcon,
  DropletIcon,
  InventoryIcon,
  LocationIcon,
  ReceiptIcon,
  TruckIcon,
  UsersIcon,
  WrenchIcon,
} from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canReadCash } from "@/features/auth/permissions";
import { getDashboardSummary } from "@/features/dashboard/api";
import type { DashboardSummary } from "@/features/dashboard/types";
import type { NavigationIconComponent } from "@/components/navigation/navigation-types";
import { getRecentlyViewed } from "@/features/recently-viewed/storage";
import type {
  RecentlyViewedEntry,
  RecentlyViewedType,
} from "@/features/recently-viewed/types";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      data: null;
      message: null;
    }
  | {
      status: "success";
      data: DashboardSummary;
      message: null;
    }
  | {
      status: "error";
      data: null;
      message: string;
    };

function formatDate(value: string): string {
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

  return "No fue posible cargar el resumen de inicio.";
}

const RECENTLY_VIEWED_LABELS: Record<RecentlyViewedType, string> = {
  product: "Producto",
  location: "Ubicación",
  supplier: "Proveedor",
  purchase: "Compra",
  sale: "Venta",
  customer: "Cliente",
  injector: "Inyector",
  service: "Servicio",
  cash: "Cierre de caja",
};

const RECENTLY_VIEWED_ICONS: Record<
  RecentlyViewedType,
  NavigationIconComponent
> = {
  product: InventoryIcon,
  location: LocationIcon,
  supplier: TruckIcon,
  purchase: ReceiptIcon,
  sale: CartIcon,
  customer: UsersIcon,
  injector: DropletIcon,
  service: WrenchIcon,
  cash: ReceiptIcon,
};

type SectionIconProps = {
  icon: NavigationIconComponent;
  accent: string;
  surface: string;
};

function SectionIcon({ icon: Icon, accent, surface }: SectionIconProps) {
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)]"
      style={{ background: surface, color: accent }}
    >
      <Icon className="size-5" />
    </span>
  );
}

function isSectionEmpty(data: DashboardSummary): boolean {
  return (
    (data.low_stock_products?.length ?? 0) === 0 &&
    (data.services_ready?.length ?? 0) === 0 &&
    (data.draft_sales?.length ?? 0) === 0 &&
    (data.draft_purchases?.length ?? 0) === 0 &&
    !data.cash_pending_week_start
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const {
    status: authStatus,
    user,
    token,
    logout,
  } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    data: null,
    message: null,
  });

  const [recentlyViewed, setRecentlyViewed] = useState<
    RecentlyViewedEntry[]
  >([]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setRecentlyViewed(getRecentlyViewed());
    });

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated" || !token) {
      return;
    }

    const controller = new AbortController();

    getDashboardSummary(token, controller.signal)
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

        if (error instanceof ApiError && error.status === 401) {
          void logout().then(() => {
            router.replace("/login");
          });

          return;
        }

        setLoadState({
          status: "error",
          data: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, logout, router, token]);

  const canSeeCash = user ? canReadCash(user) : false;

  return (
    <AppShell
      title="Inicio"
      description="Lo que hay que atender hoy."
    >
      {loadState.status === "loading" && (
        <LoadingState message="Cargando resumen…" />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el resumen"
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
          {canSeeCash && loadState.data.cash_pending_week_start && (
            <div className="app-status-card flex flex-col gap-3 border-l-4 border-l-[var(--color-warning,#a05a00)] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertIcon className="mt-0.5 size-5 shrink-0 text-[var(--color-warning,#a05a00)]" />

                <div>
                  <p className="font-semibold text-foreground">
                    Falta cerrar la caja de la semana pasada
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Semana del{" "}
                    {formatDate(loadState.data.cash_pending_week_start)}{" "}
                    todavía sin cierre.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                onClick={() => {
                  router.push("/cash/new");
                }}
              >
                Cerrar caja
              </Button>
            </div>
          )}

          {isSectionEmpty(loadState.data) ? (
            <StatePanel
              title="No hay pendientes ahora mismo"
              message="Bajo mínimo, servicios listos, borradores y caja están al día."
              tone="neutral"
            />
          ) : (
            <section className="grid gap-6 lg:grid-cols-2">
              {loadState.data.services_ready !== null && (
                <div className="app-status-card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] p-5">
                    <div className="flex items-center gap-4">
                      <SectionIcon
                        icon={WrenchIcon}
                        accent="#6e4bb8"
                        surface="#f3effb"
                      />

                      <div>
                        <h2 className="text-base font-semibold text-foreground">
                          Servicios listos para entregar
                        </h2>

                        {loadState.data.services_in_progress_count !==
                          null && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {
                              loadState.data.services_in_progress_count
                            }{" "}
                            en proceso todavía.
                          </p>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        router.push("/services");
                      }}
                    >
                      Ver todos
                    </Button>
                  </div>

                  {loadState.data.services_ready.length === 0 ? (
                    <p className="p-5 text-sm text-muted-foreground">
                      Ningún servicio listo para entregar en este momento.
                    </p>
                  ) : (
                    <ul>
                      {loadState.data.services_ready.map((service) => (
                        <li key={service.id}>
                          <button
                            type="button"
                            onClick={() => {
                              router.push(`/services/${service.id}`);
                            }}
                            className="flex w-full items-center justify-between gap-3 border-b border-[var(--color-border-soft)] px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-surface-muted/50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {service.customer_display_name}
                              </span>

                              <span className="font-mono text-xs text-muted-foreground">
                                {service.injector_number}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {loadState.data.low_stock_products !== null && (
                <div className="app-status-card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] p-5">
                    <div className="flex items-center gap-4">
                      <SectionIcon
                        icon={InventoryIcon}
                        accent="#075184"
                        surface="#eaf3f8"
                      />

                      <h2 className="text-base font-semibold text-foreground">
                        Productos bajo mínimo
                      </h2>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        router.push("/inventory/products");
                      }}
                    >
                      Ver todos
                    </Button>
                  </div>

                  {loadState.data.low_stock_products.length === 0 ? (
                    <p className="p-5 text-sm text-muted-foreground">
                      Ningún producto bajo su mínimo.
                    </p>
                  ) : (
                    <ul>
                      {loadState.data.low_stock_products.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            onClick={() => {
                              router.push(
                                `/inventory/products/${product.id}`,
                              );
                            }}
                            className="flex w-full items-center justify-between gap-3 border-b border-[var(--color-border-soft)] px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-surface-muted/50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {product.name}
                              </span>

                              <span className="font-mono text-xs text-muted-foreground">
                                {product.standard_code}
                              </span>
                            </span>

                            <span className="shrink-0 font-mono text-sm font-semibold text-[var(--color-warning,#a05a00)]">
                              {product.current_stock} / {product.minimum_stock}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {loadState.data.draft_sales !== null && (
                <div className="app-status-card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] p-5">
                    <div className="flex items-center gap-4">
                      <SectionIcon
                        icon={CartIcon}
                        accent="#248a3d"
                        surface="#edf8ef"
                      />

                      <h2 className="text-base font-semibold text-foreground">
                        Ventas en borrador
                      </h2>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        router.push("/sales");
                      }}
                    >
                      Ver todas
                    </Button>
                  </div>

                  {loadState.data.draft_sales.length === 0 ? (
                    <p className="p-5 text-sm text-muted-foreground">
                      No hay ventas a medias.
                    </p>
                  ) : (
                    <ul>
                      {loadState.data.draft_sales.map((sale) => (
                        <li key={sale.id}>
                          <button
                            type="button"
                            onClick={() => {
                              router.push(`/sales/${sale.id}`);
                            }}
                            className="flex w-full items-center justify-between gap-3 border-b border-[var(--color-border-soft)] px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-surface-muted/50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {sale.customer_display_name ??
                                  "Sin cliente"}
                              </span>

                              <span className="text-xs text-muted-foreground">
                                {formatDate(sale.sale_date)}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {loadState.data.draft_purchases !== null && (
                <div className="app-status-card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] p-5">
                    <div className="flex items-center gap-4">
                      <SectionIcon
                        icon={TruckIcon}
                        accent="#a05a00"
                        surface="#fff6e5"
                      />

                      <h2 className="text-base font-semibold text-foreground">
                        Compras en borrador
                      </h2>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        router.push("/inventory/purchases");
                      }}
                    >
                      Ver todas
                    </Button>
                  </div>

                  {loadState.data.draft_purchases.length === 0 ? (
                    <p className="p-5 text-sm text-muted-foreground">
                      No hay compras a medias.
                    </p>
                  ) : (
                    <ul>
                      {loadState.data.draft_purchases.map((purchase) => (
                        <li key={purchase.id}>
                          <button
                            type="button"
                            onClick={() => {
                              router.push(
                                `/inventory/purchases/${purchase.id}`,
                              );
                            }}
                            className="flex w-full items-center justify-between gap-3 border-b border-[var(--color-border-soft)] px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-surface-muted/50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {purchase.supplier_name}
                              </span>

                              <span className="text-xs text-muted-foreground">
                                Factura {purchase.invoice_number} ·{" "}
                                {formatDate(purchase.purchase_date)}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {recentlyViewed.length > 0 && (
            <section aria-labelledby="recently-viewed-title">
              <h2
                id="recently-viewed-title"
                className="mb-4 text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground"
              >
                Vistos recientemente
              </h2>

              <div className="app-status-card overflow-hidden">
                <ul className="grid sm:grid-cols-2">
                  {recentlyViewed.map((entry) => {
                    const EntryIcon = RECENTLY_VIEWED_ICONS[entry.type];

                    return (
                    <li key={`${entry.type}-${entry.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          router.push(entry.href);
                        }}
                        className="flex w-full items-center gap-3 border-b border-[var(--color-border-soft)] px-5 py-3.5 text-left transition-colors hover:bg-surface-muted/50"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-primary">
                          <EntryIcon className="size-4" />
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {entry.label}
                          </span>

                          <span className="text-xs text-muted-foreground">
                            {RECENTLY_VIEWED_LABELS[entry.type]}
                          </span>
                        </span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
