"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Field } from "@/components/forms/field";
import { ReportPdfActions } from "@/components/documents/report-pdf-actions";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canReadReports } from "@/features/auth/permissions";
import { formatMoney } from "@/features/inventory/purchases/format";
import {
  getSalesSummaryReport,
  getSalesSummaryReportPdf,
} from "@/features/inventory/reports/api";
import type {
  SalesSummaryBlock,
  SalesSummaryComparedField,
  SalesSummaryFilters,
  SalesSummaryGroup,
  SalesSummaryGroupBy,
  SalesSummaryReport,
  SalesSummaryVariation,
} from "@/features/inventory/reports/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: SalesSummaryReport }
  | { status: "forbidden" | "error"; message: string };

type CompareMode = "none" | "previous" | "last_year" | "custom";

const GROUP_BY_LABELS: Record<SalesSummaryGroupBy, string> = {
  day: "Día",
  week: "Semana (sábado a viernes)",
  month: "Mes",
};

const COMPARE_LABELS: Record<CompareMode, string> = {
  none: "No comparar",
  previous: "Período anterior",
  last_year: "Mismo período del año pasado",
  custom: "Otro rango",
};

const BLOCK_LABELS: Record<keyof SalesSummaryGroup, string> = {
  sales: "Ventas",
  services: "Servicios",
  total: "Total del negocio",
};

const PAYMENT_METHOD_LABELS = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
} as const;

// --- Fechas (solo fecha, "YYYY-MM-DD") --------------------------------

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setDate(date.getDate() + days);

  return toDateOnly(date);
}

function shiftYear(value: string, years: number): string {
  const date = parseDateOnly(value);
  date.setFullYear(date.getFullYear() + years);

  return toDateOnly(date);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / 86_400_000,
  );
}

function thisMonthRange(): { dateFrom: string; dateTo: string } {
  const today = new Date();

  return {
    dateFrom: toDateOnly(new Date(today.getFullYear(), today.getMonth(), 1)),
    dateTo: toDateOnly(today),
  };
}

function lastMonthRange(): { dateFrom: string; dateTo: string } {
  const today = new Date();

  return {
    dateFrom: toDateOnly(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    dateTo: toDateOnly(new Date(today.getFullYear(), today.getMonth(), 0)),
  };
}

function thisYearRange(): { dateFrom: string; dateTo: string } {
  const today = new Date();

  return {
    dateFrom: toDateOnly(new Date(today.getFullYear(), 0, 1)),
    dateTo: toDateOnly(today),
  };
}

function compareRange(
  mode: CompareMode,
  dateFrom: string,
  dateTo: string,
  custom: { compareFrom: string; compareTo: string },
): { compareFrom: string; compareTo: string } {
  if (mode === "previous") {
    // Mismo largo, justo antes.
    const length = daysBetween(dateFrom, dateTo);
    const compareTo = addDays(dateFrom, -1);

    return { compareFrom: addDays(compareTo, -length), compareTo };
  }

  if (mode === "last_year") {
    return {
      compareFrom: shiftYear(dateFrom, -1),
      compareTo: shiftYear(dateTo, -1),
    };
  }

  if (mode === "custom") {
    return custom;
  }

  return { compareFrom: "", compareTo: "" };
}

const DAY_FORMAT = new Intl.DateTimeFormat("es-CR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const SHORT_DAY_FORMAT = new Intl.DateTimeFormat("es-CR", {
  day: "numeric",
  month: "short",
});

const MONTH_FORMAT = new Intl.DateTimeFormat("es-CR", {
  month: "long",
  year: "numeric",
});

function formatPeriod(
  start: string,
  end: string,
  groupBy: SalesSummaryGroupBy,
): string {
  if (groupBy === "day") {
    return DAY_FORMAT.format(parseDateOnly(start));
  }

  if (groupBy === "month") {
    const label = MONTH_FORMAT.format(parseDateOnly(start));
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  return `${SHORT_DAY_FORMAT.format(parseDateOnly(start))} – ${DAY_FORMAT.format(parseDateOnly(end))}`;
}

function formatRange(from: string, to: string): string {
  return `${DAY_FORMAT.format(parseDateOnly(from))} – ${DAY_FORMAT.format(parseDateOnly(to))}`;
}

// --- Variación ----------------------------------------------------------

function VariationBadge({
  variation,
  isMoney,
  emphasis = false,
}: {
  variation: SalesSummaryVariation;
  isMoney: boolean;
  emphasis?: boolean;
}) {
  const amount = Number(variation.amount);

  if (amount === 0) {
    return (
      <span className="text-xs font-medium text-muted-foreground">
        Sin cambio
      </span>
    );
  }

  const isUp = amount > 0;
  const amountText = isMoney
    ? `₡${formatMoney(Math.abs(amount))}`
    : String(Math.abs(amount));

  return (
    <span
      className={[
        "inline-flex items-center gap-1 text-xs font-semibold",
        emphasis
          ? isUp
            ? "text-[var(--color-success)]"
            : "text-[var(--color-danger)]"
          : "text-muted-foreground",
      ].join(" ")}
    >
      <span aria-hidden="true">{isUp ? "▲" : "▼"}</span>
      {variation.percentage !== null
        ? `${Math.abs(Number(variation.percentage))} %`
        : amountText}
      {variation.percentage !== null && (
        <span className="font-normal text-muted-foreground">
          ({isUp ? "+" : "−"}
          {amountText})
        </span>
      )}
    </span>
  );
}

const BLOCK_ROWS: Array<{
  field: SalesSummaryComparedField;
  label: string;
  isMoney: boolean;
}> = [
  { field: "count", label: "Documentos", isMoney: false },
  { field: "subtotal", label: "Subtotal", isMoney: true },
  { field: "discount", label: "Descuentos", isMoney: true },
  { field: "tax", label: "Impuestos", isMoney: true },
  { field: "business_income", label: "Ingreso del negocio", isMoney: true },
];

function SummaryCard({
  title,
  block,
  variation,
  highlighted,
}: {
  title: string;
  block: SalesSummaryBlock;
  variation: Record<SalesSummaryComparedField, SalesSummaryVariation> | null;
  highlighted: boolean;
}) {
  return (
    <section
      className={[
        "rounded-[var(--radius-xl)] p-5 sm:p-6",
        highlighted
          ? "bg-[var(--color-primary-soft)] ring-1 ring-[rgb(7_81_132_/_16%)]"
          : "bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)]",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-muted-foreground">{title}</p>

      <p className="mt-2 font-mono text-3xl font-semibold tracking-[-0.02em] text-foreground">
        ₡{formatMoney(block.total)}
      </p>

      <div className="mt-1 min-h-5">
        {variation && (
          <VariationBadge variation={variation.total} isMoney emphasis />
        )}
      </div>

      <dl className="mt-5 grid gap-2.5 border-t border-[rgb(7_81_132_/_12%)] pt-4 text-sm">
        {BLOCK_ROWS.map((row) => (
          <div key={row.field} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right">
              <span className="font-mono font-medium text-foreground">
                {row.isMoney
                  ? `₡${formatMoney(block[row.field])}`
                  : block[row.field]}
              </span>
              {variation && (
                <span className="block">
                  <VariationBadge
                    variation={variation[row.field]}
                    isMoney={row.isMoney}
                    emphasis={row.field === "business_income"}
                  />
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// --- Página -------------------------------------------------------------

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

  return "No fue posible consultar el resumen de ventas.";
}

export default function SalesSummaryReportPage() {
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [range, setRange] = useState(thisMonthRange);

  const [groupBy, setGroupBy] = useState<SalesSummaryGroupBy>("day");

  const [compareMode, setCompareMode] = useState<CompareMode>("none");

  const [customCompare, setCustomCompare] = useState({
    compareFrom: "",
    compareTo: "",
  });

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const hasReportsAccess = user ? canReadReports(user) : false;

  const isRangeValid =
    range.dateFrom !== "" && range.dateTo !== "" && range.dateFrom <= range.dateTo;

  const comparison = isRangeValid
    ? compareRange(compareMode, range.dateFrom, range.dateTo, customCompare)
    : { compareFrom: "", compareTo: "" };

  const filters: SalesSummaryFilters = {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    groupBy,
    compareFrom: comparison.compareFrom,
    compareTo: comparison.compareTo,
  };

  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasReportsAccess ||
      !isRangeValid
    ) {
      return;
    }

    const controller = new AbortController();
    const currentFilters = JSON.parse(filtersKey) as SalesSummaryFilters;

    // Diferido: el lint no permite setState síncrono dentro del efecto.
    const timeoutId = globalThis.setTimeout(() => {
      setLoadState({ status: "loading" });
    }, 0);

    getSalesSummaryReport(token, currentFilters, controller.signal)
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
            message: "Este usuario no tiene permisos para consultar reportes.",
          });

          return;
        }

        setLoadState({ status: "error", message: getLoadErrorMessage(error) });
      });

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [authStatus, filtersKey, hasReportsAccess, isRangeValid, logout, router, token]);

  function applyQuickRange(next: { dateFrom: string; dateTo: string }): void {
    setRange(next);
  }

  if (authStatus === "authenticated" && user && !hasReportsAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de reportes."
      >
        <StatePanel
          title="No tiene acceso a reportes"
          message="Los permisos de cada usuario los asigna el Administrador."
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

  const data = loadState.status === "success" ? loadState.data : null;

  return (
    <AppShell
      title="Resumen de ventas"
      description="Ventas y servicios cobrados por período, con descuentos, impuestos y método de pago. Cuenta lo mismo que el cierre de caja."
      actions={
        <ReportPdfActions
          onBack={() => {
            router.back();
          }}
          fetchPdf={() => getSalesSummaryReportPdf(token ?? "", filters)}
          fileName={`resumen-de-ventas-${filters.dateFrom}-a-${filters.dateTo}.pdf`}
          onUnauthorized={() => {
            void logout().then(() => {
              router.replace("/login");
            });
          }}
          disabled={!token || !isRangeValid}
        />
      }
    >
      <div className="grid gap-6">
        <section className="rounded-[var(--radius-xl)] bg-surface p-5 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:p-6">
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Este mes", value: thisMonthRange() },
              { label: "Mes anterior", value: lastMonthRange() },
              { label: "Este año", value: thisYearRange() },
            ].map((option) => {
              const isActive =
                option.value.dateFrom === range.dateFrom &&
                option.value.dateTo === range.dateTo;

              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => {
                    applyQuickRange(option.value);
                  }}
                  className={[
                    "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-[var(--color-primary-soft)] text-primary ring-1 ring-[rgb(7_81_132_/_20%)]"
                      : "bg-surface-muted text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="summary-date-from" label="Desde">
              <Input
                id="summary-date-from"
                type="date"
                value={range.dateFrom}
                onChange={(event) => {
                  setRange((current) => ({ ...current, dateFrom: event.target.value }));
                }}
              />
            </Field>

            <Field id="summary-date-to" label="Hasta">
              <Input
                id="summary-date-to"
                type="date"
                value={range.dateTo}
                onChange={(event) => {
                  setRange((current) => ({ ...current, dateTo: event.target.value }));
                }}
              />
            </Field>

            <Field id="summary-group-by" label="Agrupar por">
              <select
                id="summary-group-by"
                value={groupBy}
                onChange={(event) => {
                  setGroupBy(event.target.value as SalesSummaryGroupBy);
                }}
                className="h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 text-[15px] text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
              >
                {(Object.keys(GROUP_BY_LABELS) as SalesSummaryGroupBy[]).map((value) => (
                  <option key={value} value={value}>
                    {GROUP_BY_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="summary-compare" label="Comparar con">
              <select
                id="summary-compare"
                value={compareMode}
                onChange={(event) => {
                  setCompareMode(event.target.value as CompareMode);
                }}
                className="h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 text-[15px] text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
              >
                {(Object.keys(COMPARE_LABELS) as CompareMode[]).map((value) => (
                  <option key={value} value={value}>
                    {COMPARE_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {compareMode === "custom" && (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="summary-compare-from" label="Comparar desde">
                <Input
                  id="summary-compare-from"
                  type="date"
                  value={customCompare.compareFrom}
                  onChange={(event) => {
                    setCustomCompare((current) => ({
                      ...current,
                      compareFrom: event.target.value,
                    }));
                  }}
                />
              </Field>

              <Field id="summary-compare-to" label="Comparar hasta">
                <Input
                  id="summary-compare-to"
                  type="date"
                  value={customCompare.compareTo}
                  onChange={(event) => {
                    setCustomCompare((current) => ({
                      ...current,
                      compareTo: event.target.value,
                    }));
                  }}
                />
              </Field>
            </div>
          )}

          {!isRangeValid && (
            <p className="mt-4 text-sm font-medium text-[var(--color-danger)]">
              Rango no válido: &ldquo;Desde&rdquo; no puede ser posterior a &ldquo;Hasta&rdquo;.
            </p>
          )}

          {data?.comparison && (
            <p className="mt-4 text-sm text-muted-foreground">
              Comparando {formatRange(data.date_from, data.date_to)} contra{" "}
              <span className="font-semibold text-foreground">
                {formatRange(data.comparison.date_from, data.comparison.date_to)}
              </span>
              .
            </p>
          )}
        </section>

        {loadState.status === "loading" && isRangeValid && (
          <LoadingState message="Calculando el resumen…" />
        )}

        {(loadState.status === "forbidden" || loadState.status === "error") && (
          <StatePanel
            title={
              loadState.status === "forbidden"
                ? "Acceso restringido"
                : "No se pudo cargar el resumen"
            }
            message={loadState.message}
            tone={loadState.status === "forbidden" ? "warning" : "error"}
          />
        )}

        {data && (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              {(["sales", "services", "total"] as Array<keyof SalesSummaryGroup>).map(
                (block) => (
                  <SummaryCard
                    key={block}
                    title={BLOCK_LABELS[block]}
                    block={data.summary[block]}
                    variation={data.comparison?.variation[block] ?? null}
                    highlighted={block === "total"}
                  />
                ),
              )}
            </div>

            <section className="rounded-[var(--radius-xl)] bg-surface p-5 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-soft)] sm:p-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Por método de pago
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Total del negocio (ventas y servicios), con descuento e impuesto.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(Object.keys(PAYMENT_METHOD_LABELS) as Array<keyof typeof PAYMENT_METHOD_LABELS>).map(
                  (method) => (
                    <div
                      key={method}
                      className="rounded-[var(--radius-lg)] bg-surface-muted p-4"
                    >
                      <p className="text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LABELS[method]}
                      </p>
                      <p className="mt-1 font-mono text-lg font-semibold text-foreground">
                        ₡{formatMoney(data.summary.total.by_method[method])}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </section>

            <section className="app-status-card overflow-hidden">
              <div className="border-b border-[var(--color-border-soft)] p-6">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  Detalle por {groupBy === "day" ? "día" : groupBy === "week" ? "semana" : "mes"}
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Solo los períodos con ventas o servicios.
                </p>
              </div>

              {data.periods.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    No hay ventas ni servicios en este rango
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sin ventas confirmadas ni servicios entregados entre esas fechas.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                        {[
                          "Período",
                          "Ventas",
                          "Servicios",
                          "Descuentos",
                          "Impuestos",
                          "Total",
                          "Ingreso del negocio",
                        ].map((heading, index) => (
                          <th
                            key={heading}
                            className={[
                              "px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                              index > 0 ? "text-right" : "",
                            ].join(" ")}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {data.periods.map((period) => (
                        <tr
                          key={period.period_start}
                          className="border-b border-[var(--color-border-soft)] last:border-b-0"
                        >
                          <td className="px-5 py-4 text-sm font-semibold text-foreground">
                            {formatPeriod(period.period_start, period.period_end, data.group_by)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-sm text-foreground">
                            ₡{formatMoney(period.sales.total)}
                            <span className="block font-sans text-xs text-muted-foreground">
                              {period.sales.count} {period.sales.count === 1 ? "venta" : "ventas"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-sm text-foreground">
                            ₡{formatMoney(period.services.total)}
                            <span className="block font-sans text-xs text-muted-foreground">
                              {period.services.count}{" "}
                              {period.services.count === 1 ? "servicio" : "servicios"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-sm text-muted-foreground">
                            ₡{formatMoney(period.total.discount)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-sm text-[var(--color-warning)]">
                            ₡{formatMoney(period.total.tax)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-foreground">
                            ₡{formatMoney(period.total.total)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-sm text-[var(--color-success)]">
                            ₡{formatMoney(period.total.business_income)}
                          </td>
                        </tr>
                      ))}
                    </tbody>

                    <tfoot>
                      <tr className="border-t border-[var(--color-border-strong)] bg-surface-muted/50">
                        <td className="px-5 py-4 text-sm font-semibold text-foreground">
                          Total del rango
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-foreground">
                          ₡{formatMoney(data.summary.sales.total)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-foreground">
                          ₡{formatMoney(data.summary.services.total)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-muted-foreground">
                          ₡{formatMoney(data.summary.total.discount)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-[var(--color-warning)]">
                          ₡{formatMoney(data.summary.total.tax)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-foreground">
                          ₡{formatMoney(data.summary.total.total)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-[var(--color-success)]">
                          ₡{formatMoney(data.summary.total.business_income)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
