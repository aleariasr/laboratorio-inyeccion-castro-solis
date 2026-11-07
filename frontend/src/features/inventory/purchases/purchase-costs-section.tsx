"use client";

import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";

import {
  calculatePurchaseCosts,
  createImportCost,
  getCostSummary,
  getImportCosts,
  getProductCostHistory,
  updateImportCost,
} from "./api";
import { crcEquivalent, formatColones, formatDate, formatMoney, formatNumber } from "./format";
import { ImportCostForm } from "./import-cost-form";
import { mapImportCostApiFieldErrors } from "./import-cost-form-errors";
import {
  buildImportCostWritePayload,
  emptyImportCostFormValues,
  importCostToFormValues,
  type CostSummary,
  type Currency,
  type ImportCost,
  type ImportCostFormErrors,
  type ImportCostFormValues,
  type ProductCostHistory,
} from "./types";

type CostsLoadState =
  | { status: "loading"; importCosts: null; message: null }
  | { status: "success"; importCosts: ImportCost[]; message: null }
  | { status: "error"; importCosts: null; message: string };

type HistoryLoadState =
  | { status: "not-permitted"; history: null }
  | { status: "loading"; history: null }
  | { status: "success"; history: ProductCostHistory[] }
  | { status: "error"; history: null; message: string };

type CostFormState =
  | { mode: "closed"; importCost: null }
  | { mode: "create"; importCost: null }
  | { mode: "edit"; importCost: ImportCost };

type CostActionState = {
  isSubmitting: boolean;
  submitError: string | null;
  fieldErrors: ImportCostFormErrors;
  pendingToggleId: number | null;
};

type SummaryState = {
  marginPercentage: string;
  isCalculating: boolean;
  error: string | null;
  result: CostSummary | null;
};

type ApplyState = {
  isApplying: boolean;
  error: string | null;
};

type PurchaseCostsSectionProps = {
  purchaseId: number;
  currency: Currency;
  /** Tipo de cambio de la compra, en colones por dólar. */
  purchaseExchangeRate: string;
  token: string;
  hasWriteAccess: boolean;
  canReadCosts: boolean;
  /**
   * Solo en borrador se editan los costos de importación (confirmar es
   * definitivo) y el backend descarta el cálculo al cambiar algo.
   */
  isDraft: boolean;
  /** Una compra anulada no se calcula. */
  isCancelled: boolean;
  /** El detalle de la compra ya descartó el cálculo (cambió una línea). */
  wasCalculationDiscarded: boolean;
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

  return "No fue posible consultar los costos de importación.";
}

/**
 * Un monto en su moneda: en colones "₡5 200"; en dólares "US$10" y debajo
 * su equivalente en colones con el tipo de cambio indicado.
 */
function MoneyCell({
  amount,
  currency,
  exchangeRate,
}: {
  amount: string | number;
  currency: Currency;
  exchangeRate: string | number;
}) {
  if (currency !== "USD") {
    return <p className="leading-tight">{formatColones(amount)}</p>;
  }

  const equivalent = crcEquivalent(amount, exchangeRate);

  return (
    <div>
      <p className="leading-tight">US${formatMoney(amount)}</p>

      {equivalent && (
        <p className="leading-tight text-xs text-[var(--color-text-subtle)]">
          {equivalent}
        </p>
      )}
    </div>
  );
}

export function PurchaseCostsSection({
  purchaseId,
  currency,
  purchaseExchangeRate,
  token,
  hasWriteAccess,
  canReadCosts,
  isDraft,
  isCancelled,
  wasCalculationDiscarded,
}: PurchaseCostsSectionProps) {
  const canEditImportCosts = hasWriteAccess && isDraft;

  const [loadState, setLoadState] = useState<CostsLoadState>({
    status: "loading",
    importCosts: null,
    message: null,
  });

  const [historyState, setHistoryState] = useState<HistoryLoadState>({
    status: canReadCosts ? "loading" : "not-permitted",
    history: null,
  });

  const [formState, setFormState] = useState<CostFormState>({
    mode: "closed",
    importCost: null,
  });

  const [actionState, setActionState] = useState<CostActionState>({
    isSubmitting: false,
    submitError: null,
    fieldErrors: {},
    pendingToggleId: null,
  });

  const [summaryState, setSummaryState] = useState<SummaryState>({
    marginPercentage: "0",
    isCalculating: false,
    error: null,
    result: null,
  });

  const [applyState, setApplyState] = useState<ApplyState>({
    isApplying: false,
    error: null,
  });

  const [showDiscardedNotice, setShowDiscardedNotice] = useState(
    wasCalculationDiscarded,
  );

  // Al cambiar un costo de importación de una compra en borrador, el
  // backend borra el cálculo guardado de esa compra (ver
  // discard_purchase_cost_calculation). Se refleja en pantalla en vez de
  // dejar un resumen y un historial que ya no existen.
  function markCalculationDiscarded(): void {
    if (!isDraft) {
      return;
    }

    setSummaryState((current) => ({ ...current, result: null, error: null }));

    setHistoryState((current) =>
      current.status === "success"
        ? { status: "success", history: [] }
        : current,
    );

    setShowDiscardedNotice(true);
  }

  useEffect(() => {
    const controller = new AbortController();

    getImportCosts(token, purchaseId, controller.signal)
      .then((importCosts) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", importCosts, message: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setLoadState({
          status: "error",
          importCosts: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [purchaseId, token]);

  useEffect(() => {
    if (!canReadCosts) {
      return;
    }

    const controller = new AbortController();

    getProductCostHistory(token, purchaseId, controller.signal)
      .then((history) => {
        if (controller.signal.aborted) {
          return;
        }

        setHistoryState({ status: "success", history });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setHistoryState({
          status: "error",
          history: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [canReadCosts, purchaseId, token]);

  function openCreateForm(): void {
    setActionState({ isSubmitting: false, submitError: null, fieldErrors: {}, pendingToggleId: null });
    setFormState({ mode: "create", importCost: null });
  }

  function openEditForm(importCost: ImportCost): void {
    setActionState({ isSubmitting: false, submitError: null, fieldErrors: {}, pendingToggleId: null });
    setFormState({ mode: "edit", importCost });
  }

  function closeForm(): void {
    if (actionState.isSubmitting) {
      return;
    }

    setFormState({ mode: "closed", importCost: null });
    setActionState({ isSubmitting: false, submitError: null, fieldErrors: {}, pendingToggleId: null });
  }

  function updateImportCostsInState(updated: ImportCost): void {
    setLoadState((current) => {
      if (current.status !== "success") {
        return current;
      }

      const exists = current.importCosts.some((cost) => cost.id === updated.id);

      const importCosts = exists
        ? current.importCosts.map((cost) => (cost.id === updated.id ? updated : cost))
        : [...current.importCosts, updated];

      return { ...current, importCosts };
    });
  }

  async function handleFormSubmit(values: ImportCostFormValues): Promise<void> {
    if (formState.mode === "closed") {
      return;
    }

    setActionState((current) => ({ ...current, isSubmitting: true, submitError: null, fieldErrors: {} }));

    try {
      const saved =
        formState.mode === "create"
          ? await createImportCost(token, buildImportCostWritePayload(purchaseId, values))
          : await updateImportCost(token, formState.importCost.id, {
              category: Number(values.categoryId),
              description: values.description.trim(),
              amount: values.amount.trim(),
              currency: values.currency,
              exchange_rate: values.exchangeRate.trim(),
              is_active: values.isActive,
            });

      updateImportCostsInState(saved);
      markCalculationDiscarded();

      setFormState({ mode: "closed", importCost: null });
      setActionState({ isSubmitting: false, submitError: null, fieldErrors: {}, pendingToggleId: null });
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        const fieldErrors = mapImportCostApiFieldErrors(error.fieldErrors);

        setActionState((current) => ({
          ...current,
          isSubmitting: false,
          submitError: Object.keys(fieldErrors).length > 0 ? null : error.message,
          fieldErrors,
        }));

        return;
      }

      setActionState((current) => ({ ...current, isSubmitting: false, submitError: getErrorMessage(error) }));
    }
  }

  async function handleToggleActive(importCost: ImportCost): Promise<void> {
    setActionState((current) => ({
      ...current,
      submitError: null,
      fieldErrors: {},
      pendingToggleId: importCost.id,
    }));

    try {
      const updated = await updateImportCost(token, importCost.id, {
        is_active: !importCost.is_active,
      });

      updateImportCostsInState(updated);
      markCalculationDiscarded();

      setActionState((current) => ({ ...current, pendingToggleId: null }));
    } catch (error: unknown) {
      setActionState((current) => ({
        ...current,
        submitError: getErrorMessage(error),
        pendingToggleId: null,
      }));
    }
  }

  async function handleCalculateSummary(): Promise<void> {
    const margin = summaryState.marginPercentage.trim();

    if (!margin || Number.isNaN(Number(margin)) || Number(margin) < 0) {
      setSummaryState((current) => ({
        ...current,
        error: "El margen debe ser 0 o mayor.",
        result: null,
      }));

      return;
    }

    setSummaryState((current) => ({ ...current, isCalculating: true, error: null }));

    try {
      const result = await getCostSummary(token, purchaseId, margin);

      setSummaryState((current) => ({ ...current, isCalculating: false, result }));
    } catch (error: unknown) {
      setSummaryState((current) => ({
        ...current,
        isCalculating: false,
        error: getErrorMessage(error),
        result: null,
      }));
    }
  }

  async function handleApplyCosts(): Promise<void> {
    const margin = summaryState.marginPercentage.trim();

    if (!margin || Number.isNaN(Number(margin)) || Number(margin) < 0) {
      setApplyState({ isApplying: false, error: "Aplicar los costos requiere un margen válido (0 o mayor)." });
      return;
    }

    if (
      !confirmWithFocusRestore(
        [
          "¿Aplicar estos costos a los productos de la compra?",
          "Reemplaza el cálculo anterior de esta compra, si lo había.",
          isDraft
            ? "El precio de venta de los productos se actualizará cuando la compra se confirme."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      )
    ) {
      return;
    }

    setApplyState({ isApplying: true, error: null });

    try {
      const histories = await calculatePurchaseCosts(token, purchaseId, margin);

      setShowDiscardedNotice(false);

      setHistoryState((current) => {
        if (current.status !== "success") {
          return current;
        }

        return { status: "success", history: histories };
      });

      setApplyState({ isApplying: false, error: null });
    } catch (error: unknown) {
      setApplyState({ isApplying: false, error: getErrorMessage(error) });
    }
  }

  const initialFormValues =
    formState.mode === "edit"
      ? importCostToFormValues(formState.importCost)
      : emptyImportCostFormValues(currency, purchaseExchangeRate);

  const formKey = formState.mode === "edit" ? `edit-${formState.importCost.id}` : "create";

  return (
    <div className="grid gap-6">
      {showDiscardedNotice && isDraft && (
        <p
          role="status"
          className="rounded-[var(--radius-md)] border border-[var(--color-border-soft)] bg-surface-muted px-5 py-4 text-sm text-foreground"
        >
          Se borraron los costos calculados porque cambiaron las líneas o los
          costos de importación de esta compra. Hace falta calcularlos y
          aplicarlos de nuevo.
        </p>
      )}

      <section className="app-status-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[var(--color-border-soft)] p-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Costos de importación
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              {isDraft
                ? "Costos adicionales de la factura (flete, seguros, impuestos, etc.), cada uno en la moneda y con el tipo de cambio con que se pagó."
                : "Costos adicionales de la factura. En una compra confirmada o anulada ya no cambian."}
            </p>
          </div>

          {canEditImportCosts && formState.mode === "closed" && (
            <Button type="button" onClick={openCreateForm}>
              Agregar costo
            </Button>
          )}
        </div>

        {loadState.status === "loading" && (
          <div className="p-6 text-sm text-muted-foreground">Consultando costos…</div>
        )}

        {loadState.status === "error" && (
          <div className="p-6">
            <FormError message={loadState.message} />
          </div>
        )}

        {loadState.status === "success" && (
          <>
            {actionState.submitError && formState.mode === "closed" && (
              <div className="border-b border-[var(--color-border-soft)] p-6">
                <FormError message={actionState.submitError} />
              </div>
            )}

            {formState.mode !== "closed" && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-6">
                <div className="mb-5">
                  <h3 className="text-base font-semibold text-foreground">
                    {formState.mode === "create" ? "Agregar costo" : "Editar costo"}
                  </h3>
                </div>

                <ImportCostForm
                  key={formKey}
                  mode={formState.mode}
                  initialValues={initialFormValues}
                  purchaseCurrency={currency}
                  purchaseExchangeRate={purchaseExchangeRate}
                  token={token}
                  isSubmitting={actionState.isSubmitting}
                  submitError={actionState.submitError}
                  serverErrors={actionState.fieldErrors}
                  onSubmit={handleFormSubmit}
                  onCancel={closeForm}
                />
              </div>
            )}

            {loadState.importCosts.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Esta compra todavía no tiene costos de importación registrados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Categoría
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Descripción
                      </th>

                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Monto
                      </th>

                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Tipo de cambio
                      </th>

                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        En colones
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Estado
                      </th>

                      {canEditImportCosts && (
                        <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Acciones
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {loadState.importCosts.map((importCost) => (
                      <tr key={importCost.id} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                        <td className="px-5 py-4 text-sm font-semibold text-foreground">
                          {importCost.category_detail.name}
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">
                          {importCost.description || "—"}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm text-foreground">
                          {importCost.currency === "USD"
                            ? `US$${formatMoney(importCost.amount)}`
                            : formatColones(importCost.amount)}
                        </td>

                        {/* Colones por dólar con que se pagó este costo:
                            no depende de la moneda de la compra. */}
                        <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm text-muted-foreground">
                          {importCost.currency === "USD"
                            ? formatNumber(importCost.exchange_rate, 4)
                            : "No aplica"}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm font-semibold text-foreground">
                          {formatColones(
                            Number(importCost.amount) *
                              (importCost.currency === "USD" ? Number(importCost.exchange_rate) : 1),
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                              importCost.is_active
                                ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                                : "bg-surface-muted text-muted-foreground",
                            ].join(" ")}
                          >
                            {importCost.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </td>

                        {canEditImportCosts && (
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  openEditForm(importCost);
                                }}
                                disabled={actionState.isSubmitting || actionState.pendingToggleId !== null}
                              >
                                Editar
                              </Button>

                              <Button
                                type="button"
                                variant={importCost.is_active ? "danger" : "secondary"}
                                isLoading={actionState.pendingToggleId === importCost.id}
                                loadingText={importCost.is_active ? "Inactivando…" : "Activando…"}
                                onClick={() => {
                                  void handleToggleActive(importCost);
                                }}
                                disabled={
                                  actionState.isSubmitting ||
                                  (actionState.pendingToggleId !== null && actionState.pendingToggleId !== importCost.id)
                                }
                              >
                                {importCost.is_active ? "Inactivar" : "Activar"}
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* El resumen trae costo final y precio sugerido por línea: el
          backend lo exige con view_costs (ViewCostsRequired). */}
      {loadState.status === "success" && canReadCosts && (
        <section className="app-status-card overflow-hidden">
          <div className="border-b border-[var(--color-border-soft)] p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Resumen de costos
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Todo en colones: las líneas con el tipo de cambio de la compra y cada costo con el suyo.
              Precio sugerido según el margen, a dos decimales.
            </p>
          </div>

          <div className="grid gap-4 p-6">
            {summaryState.error && <FormError message={summaryState.error} />}

            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px]">
                <Field id="cost-summary-margin" label="Margen (%)">
                  <Input
                    id="cost-summary-margin"
                    value={summaryState.marginPercentage}
                    onChange={(event) => {
                      const marginPercentage = event.target.value;

                      setSummaryState((current) => ({ ...current, marginPercentage }));
                    }}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </Field>
              </div>

              <Button
                type="button"
                variant="secondary"
                isLoading={summaryState.isCalculating}
                loadingText="Calculando…"
                onClick={() => {
                  void handleCalculateSummary();
                }}
              >
                Calcular resumen
              </Button>

              {hasWriteAccess && !isCancelled && (
                <Button
                  type="button"
                  isLoading={applyState.isApplying}
                  loadingText="Aplicando…"
                  onClick={() => {
                    void handleApplyCosts();
                  }}
                >
                  Aplicar costos a productos
                </Button>
              )}
            </div>

            {applyState.error && <FormError message={applyState.error} />}

            {summaryState.result && (() => {
              const result = summaryState.result;

              return (
                <dl className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Subtotal factura
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-foreground">
                      {formatColones(result.invoice_subtotal)}
                    </dd>
                    {result.currency === "USD" && (
                      <dd className="mt-0.5 text-xs text-[var(--color-text-subtle)]">
                        US${formatMoney(result.invoice_subtotal_original)} a ₡
                        {formatNumber(result.exchange_rate, 4)}
                      </dd>
                    )}
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Costos adicionales
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-foreground">
                      {formatColones(result.import_costs_total)}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Costo total
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-foreground">
                      {formatColones(result.total_cost)}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Factor de costo
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-foreground">
                      ×{formatNumber(result.cost_factor, 6)}
                    </dd>
                  </div>
                </dl>
              );
            })()}

            {summaryState.result && summaryState.result.items.length > 0 && (() => {
              const result = summaryState.result;

              return (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Precio sugerido por producto
                  </p>

                  <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
                    <table className="w-full min-w-[640px] border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Producto
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Cantidad
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Costo unitario
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Costo final
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Precio sugerido
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {result.items.map((item) => (
                          <tr
                            key={item.supplier_product}
                            className="border-b border-[var(--color-border-soft)] last:border-b-0"
                          >
                            <td className="px-4 py-3">
                              <p className="font-mono text-sm font-semibold text-foreground">
                                {item.standard_code}
                              </p>

                              <p className="mt-1 text-sm text-muted-foreground">{item.name}</p>
                            </td>

                            <td className="px-4 py-3 text-right font-mono text-sm text-foreground">{item.quantity}</td>

                            <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-foreground">
                              <MoneyCell
                                amount={item.original_unit_cost}
                                currency={result.currency}
                                exchangeRate={result.exchange_rate}
                              />
                            </td>

                            <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-foreground">
                              {formatColones(item.final_unit_cost)}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-semibold text-foreground">
                              {formatColones(item.suggested_price)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {historyState.status === "success" && historyState.history.length > 0 && (
        <section className="app-status-card overflow-hidden">
          <div className="border-b border-[var(--color-border-soft)] p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Histórico de costos aplicados
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Costo final y precio sugerido en colones de cada producto de esta compra.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Producto
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Costo unitario
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Costo final
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Margen
                  </th>

                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Precio sugerido
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Calculado
                  </th>
                </tr>
              </thead>

              <tbody>
                {historyState.history.map((history) => (
                  <tr key={history.id} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                    <td className="px-5 py-4">
                      <p className="font-mono text-sm font-semibold text-foreground">
                        {history.product_detail.standard_code}
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">{history.product_detail.name}</p>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm text-foreground">
                      <MoneyCell
                        amount={history.original_unit_cost}
                        currency={history.currency}
                        exchangeRate={history.exchange_rate}
                      />
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm font-semibold text-foreground">
                      {formatColones(history.final_unit_cost)}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm text-foreground">
                      {formatNumber(history.margin_percentage)}%
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm text-foreground">
                      {history.suggested_price ? formatColones(history.suggested_price) : "—"}
                    </td>

                    <td className="px-5 py-4 text-sm text-muted-foreground">{formatDate(history.calculated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
