"use client";

import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

import {
  calculatePurchaseCosts,
  createImportCost,
  getCostSummary,
  getImportCosts,
  getProductCostHistory,
  updateImportCost,
} from "./api";
import { crcEquivalent, formatDate, formatMoney, formatNumber } from "./format";
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
  | { status: "loading"; importCosts: null; history: null; message: null }
  | { status: "success"; importCosts: ImportCost[]; history: ProductCostHistory[]; message: null }
  | { status: "error"; importCosts: null; history: null; message: string };

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
  token: string;
  hasWriteAccess: boolean;
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

function MoneyCell({
  amount,
  currency,
  exchangeRate,
}: {
  amount: string | number;
  currency: Currency;
  exchangeRate: string | number;
}) {
  const equivalent = currency === "USD" ? crcEquivalent(amount, exchangeRate) : null;

  return (
    <div>
      <p className="leading-tight">
        {formatMoney(amount)} {currency}
      </p>

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
  token,
  hasWriteAccess,
}: PurchaseCostsSectionProps) {
  const [loadState, setLoadState] = useState<CostsLoadState>({
    status: "loading",
    importCosts: null,
    history: null,
    message: null,
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

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      getImportCosts(token, purchaseId, controller.signal),
      getProductCostHistory(token, purchaseId, controller.signal),
    ])
      .then(([importCosts, history]) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", importCosts, history, message: null });
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
          history: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [purchaseId, token]);

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
        error: "Indique un margen válido (0 o mayor).",
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
      setApplyState({ isApplying: false, error: "Indique un margen válido antes de aplicar los costos." });
      return;
    }

    if (
      !globalThis.confirm(
        "¿Aplicar estos costos a los productos de la compra? Se creará un nuevo registro de histórico de costos por cada línea.",
      )
    ) {
      return;
    }

    setApplyState({ isApplying: true, error: null });

    try {
      const histories = await calculatePurchaseCosts(token, purchaseId, margin);

      setLoadState((current) => {
        if (current.status !== "success") {
          return current;
        }

        return { ...current, history: [...histories, ...current.history] };
      });

      setApplyState({ isApplying: false, error: null });
    } catch (error: unknown) {
      setApplyState({ isApplying: false, error: getErrorMessage(error) });
    }
  }

  const initialFormValues =
    formState.mode === "edit"
      ? importCostToFormValues(formState.importCost)
      : emptyImportCostFormValues(currency);

  const formKey = formState.mode === "edit" ? `edit-${formState.importCost.id}` : "create";

  return (
    <div className="grid gap-6">
      <section className="app-status-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[var(--color-border-soft)] p-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Costos de importación
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Costos adicionales de la factura (flete, seguros, impuestos, etc.).
            </p>
          </div>

          {hasWriteAccess && formState.mode === "closed" && (
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
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Categoría
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Descripción
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Monto
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Tipo de cambio
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Estado
                      </th>

                      {hasWriteAccess && (
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

                        <td className="px-5 py-4 text-sm text-foreground">
                          <MoneyCell
                            amount={importCost.amount}
                            currency={importCost.currency}
                            exchangeRate={importCost.exchange_rate}
                          />
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">
                          {formatNumber(importCost.exchange_rate, 4)}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                              importCost.is_active
                                ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                                : "bg-surface-muted text-muted-foreground",
                            ].join(" ")}
                          >
                            {importCost.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </td>

                        {hasWriteAccess && (
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

      {loadState.status === "success" && (
        <section className="app-status-card overflow-hidden">
          <div className="border-b border-[var(--color-border-soft)] p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Resumen de costos
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Calcule el costo total de la compra (líneas + costos activos) y el precio sugerido según un margen.
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

              {hasWriteAccess && (
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

            {summaryState.result && (
              <dl className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Subtotal factura
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    <MoneyCell
                      amount={summaryState.result.invoice_subtotal}
                      currency={summaryState.result.currency}
                      exchangeRate={summaryState.result.exchange_rate}
                    />
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Costos adicionales
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    <MoneyCell
                      amount={summaryState.result.import_costs_total}
                      currency={summaryState.result.currency}
                      exchangeRate={summaryState.result.exchange_rate}
                    />
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Costo total
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    <MoneyCell
                      amount={summaryState.result.total_cost}
                      currency={summaryState.result.currency}
                      exchangeRate={summaryState.result.exchange_rate}
                    />
                  </dd>
                </div>
              </dl>
            )}

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

                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Cantidad
                          </th>

                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Costo original
                          </th>

                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Costo final
                          </th>

                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
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

                            <td className="px-4 py-3 text-sm text-foreground">{item.quantity}</td>

                            <td className="px-4 py-3 text-sm text-foreground">
                              <MoneyCell
                                amount={item.original_unit_cost}
                                currency={result.currency}
                                exchangeRate={result.exchange_rate}
                              />
                            </td>

                            <td className="px-4 py-3 text-sm text-foreground">
                              <MoneyCell
                                amount={item.final_unit_cost}
                                currency={result.currency}
                                exchangeRate={result.exchange_rate}
                              />
                            </td>

                            <td className="px-4 py-3 text-sm font-semibold text-foreground">
                              <MoneyCell
                                amount={item.suggested_price}
                                currency={result.currency}
                                exchangeRate={result.exchange_rate}
                              />
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

      {loadState.status === "success" && loadState.history.length > 0 && (
        <section className="app-status-card overflow-hidden">
          <div className="border-b border-[var(--color-border-soft)] p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Histórico de costos aplicados
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Costos finales calculados y aplicados a cada producto de esta compra.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Producto
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Costo original
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Costo final
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Margen
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Precio sugerido
                  </th>

                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Calculado
                  </th>
                </tr>
              </thead>

              <tbody>
                {loadState.history.map((history) => (
                  <tr key={history.id} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                    <td className="px-5 py-4">
                      <p className="font-mono text-sm font-semibold text-foreground">
                        {history.product_detail.standard_code}
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">{history.product_detail.name}</p>
                    </td>

                    <td className="px-5 py-4 text-sm text-foreground">
                      <MoneyCell
                        amount={history.original_unit_cost}
                        currency={history.currency}
                        exchangeRate={history.exchange_rate}
                      />
                    </td>

                    <td className="px-5 py-4 text-sm font-semibold text-foreground">
                      <MoneyCell
                        amount={history.final_unit_cost}
                        currency={history.currency}
                        exchangeRate={history.exchange_rate}
                      />
                    </td>

                    <td className="px-5 py-4 text-sm text-foreground">{formatNumber(history.margin_percentage)}%</td>

                    <td className="px-5 py-4 text-sm text-foreground">
                      {history.suggested_price ? (
                        <MoneyCell
                          amount={history.suggested_price}
                          currency={history.currency}
                          exchangeRate={history.exchange_rate}
                        />
                      ) : (
                        "—"
                      )}
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
