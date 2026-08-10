"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { Field } from "@/components/forms/field";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth-context";
import { canReadSales, canWriteSales } from "@/features/auth/permissions";
import { crcEquivalent, formatDate, formatMoney } from "@/features/inventory/purchases/format";
import {
  cancelSale,
  confirmSale,
  createSaleItem,
  deleteSaleItem,
  getSale,
  updateSaleItem,
} from "@/features/sales/api";
import { mapSaleItemApiFieldErrors } from "@/features/sales/sale-item-form-errors";
import { SaleItemForm } from "@/features/sales/sale-item-form";
import {
  buildSaleItemWritePayload,
  EMPTY_SALE_ITEM_FORM_VALUES,
  type Sale,
  type SaleItemFormErrors,
  type SaleItemFormValues,
  type SaleItemInline,
  type SaleStatus,
} from "@/features/sales/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      sale: null;
      message: null;
    }
  | {
      status: "success";
      sale: Sale;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      sale: null;
      message: string;
    };

type ItemFormState =
  | { mode: "closed"; item: null }
  | { mode: "create"; item: null }
  | { mode: "edit"; item: SaleItemInline };

type ItemActionState = {
  isSubmitting: boolean;
  submitError: string | null;
  fieldErrors: SaleItemFormErrors;
  pendingDeleteItemId: number | null;
};

type ConfirmActionState = {
  isSubmitting: boolean;
  error: string | null;
};

type CancelActionState = {
  isOpen: boolean;
  reason: string;
  isSubmitting: boolean;
  error: string | null;
};

const STATUS_LABELS: Record<SaleStatus, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmada",
  CANCELLED: "Anulada",
};

const STATUS_BADGE_CLASSES: Record<SaleStatus, string> = {
  DRAFT: "bg-surface-muted text-muted-foreground",
  CONFIRMED: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  CANCELLED: "bg-[var(--color-danger-soft)] text-danger",
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

  return "No fue posible consultar la venta.";
}

function formatItemLabel(item: SaleItemInline): string {
  return `${item.product_detail.standard_code} — ${item.product_detail.name}`;
}

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    sale: null,
    message: null,
  });

  const [itemFormState, setItemFormState] = useState<ItemFormState>({
    mode: "closed",
    item: null,
  });

  const [itemActionState, setItemActionState] = useState<ItemActionState>({
    isSubmitting: false,
    submitError: null,
    fieldErrors: {},
    pendingDeleteItemId: null,
  });

  const [confirmActionState, setConfirmActionState] = useState<ConfirmActionState>({
    isSubmitting: false,
    error: null,
  });

  const [cancelActionState, setCancelActionState] = useState<CancelActionState>({
    isOpen: false,
    reason: "",
    isSubmitting: false,
    error: null,
  });

  const saleId = Number(params.id);

  const hasSalesAccess = user ? canReadSales(user) : false;

  const hasWriteAccess = user ? canWriteSales(user) : false;

  const canManageItems =
    loadState.status === "success" &&
    loadState.sale.status === "DRAFT" &&
    hasWriteAccess;

  const itemFormInitialValues =
    itemFormState.mode === "edit"
      ? {
          productId: String(itemFormState.item.product),
          quantity: String(itemFormState.item.quantity),
          unitPrice: itemFormState.item.unit_price,
        }
      : EMPTY_SALE_ITEM_FORM_VALUES;

  const itemFormKey =
    itemFormState.mode === "edit" ? `edit-${itemFormState.item.id}` : "create";

  const itemDisplayLabel =
    itemFormState.mode === "edit" ? formatItemLabel(itemFormState.item) : undefined;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasSalesAccess ||
      !Number.isInteger(saleId) ||
      saleId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getSale(token, saleId, controller.signal)
      .then((sale) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", sale, message: null });
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
            sale: null,
            message: "Este usuario no tiene permisos para consultar ventas.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            sale: null,
            message: "La venta solicitada no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          sale: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasSalesAccess, logout, saleId, router, token]);

  function goBack(): void {
    router.back();
  }

  function openCreateItemForm(): void {
    setItemActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingDeleteItemId: null,
    });

    setItemFormState({ mode: "create", item: null });
  }

  function openEditItemForm(item: SaleItemInline): void {
    setItemActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingDeleteItemId: null,
    });

    setItemFormState({ mode: "edit", item });
  }

  function closeItemForm(): void {
    if (itemActionState.isSubmitting) {
      return;
    }

    setItemFormState({ mode: "closed", item: null });

    setItemActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingDeleteItemId: null,
    });
  }

  function updateItemsInState(updated: SaleItemInline): void {
    setLoadState((current) => {
      if (current.status !== "success") {
        return current;
      }

      const exists = current.sale.items.some((item) => item.id === updated.id);

      const items = exists
        ? current.sale.items.map((item) => (item.id === updated.id ? updated : item))
        : [...current.sale.items, updated];

      return {
        ...current,
        sale: { ...current.sale, items },
      };
    });
  }

  function removeItemFromState(itemId: number): void {
    setLoadState((current) => {
      if (current.status !== "success") {
        return current;
      }

      return {
        ...current,
        sale: {
          ...current.sale,
          items: current.sale.items.filter((item) => item.id !== itemId),
        },
      };
    });
  }

  async function handleItemSubmit(values: SaleItemFormValues): Promise<void> {
    if (!token || loadState.status !== "success" || itemFormState.mode === "closed") {
      return;
    }

    setItemActionState((current) => ({
      ...current,
      isSubmitting: true,
      submitError: null,
      fieldErrors: {},
    }));

    try {
      const payload = buildSaleItemWritePayload(loadState.sale.id, values);

      const saved =
        itemFormState.mode === "create"
          ? await createSaleItem(token, payload)
          : await updateSaleItem(token, itemFormState.item.id, {
              quantity: payload.quantity,
              unit_price: payload.unit_price,
            });

      updateItemsInState(saved);

      setItemFormState({ mode: "closed", item: null });

      setItemActionState({
        isSubmitting: false,
        submitError: null,
        fieldErrors: {},
        pendingDeleteItemId: null,
      });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setItemActionState((current) => ({
          ...current,
          isSubmitting: false,
          submitError: "Este usuario no tiene permisos para modificar líneas de venta.",
        }));

        return;
      }

      if (error instanceof ApiError) {
        const fieldErrors = mapSaleItemApiFieldErrors(error.fieldErrors);

        setItemActionState((current) => ({
          ...current,
          isSubmitting: false,
          submitError: Object.keys(fieldErrors).length > 0 ? null : error.message,
          fieldErrors,
        }));

        return;
      }

      setItemActionState((current) => ({
        ...current,
        isSubmitting: false,
        submitError: getErrorMessage(error),
      }));
    }
  }

  async function handleDeleteItem(item: SaleItemInline): Promise<void> {
    if (!token) {
      return;
    }

    if (!globalThis.confirm(`¿Eliminar la línea de ${formatItemLabel(item)}?`)) {
      return;
    }

    setItemActionState((current) => ({
      ...current,
      submitError: null,
      fieldErrors: {},
      pendingDeleteItemId: item.id,
    }));

    try {
      await deleteSaleItem(token, item.id);

      removeItemFromState(item.id);

      setItemActionState((current) => ({
        ...current,
        pendingDeleteItemId: null,
      }));
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para eliminar líneas de venta."
          : getErrorMessage(error);

      setItemActionState((current) => ({
        ...current,
        submitError: message,
        pendingDeleteItemId: null,
      }));
    }
  }

  async function handleConfirmSale(): Promise<void> {
    if (!token || loadState.status !== "success") {
      return;
    }

    if (
      !globalThis.confirm(
        "¿Confirmar esta venta? Se generará la salida de inventario correspondiente y ya no podrá editarse.",
      )
    ) {
      return;
    }

    setConfirmActionState({ isSubmitting: true, error: null });

    try {
      const updated = await confirmSale(token, loadState.sale.id);

      setLoadState({ status: "success", sale: updated, message: null });

      setConfirmActionState({ isSubmitting: false, error: null });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para confirmar ventas."
          : getErrorMessage(error);

      setConfirmActionState({ isSubmitting: false, error: message });
    }
  }

  function openCancelForm(): void {
    setCancelActionState({
      isOpen: true,
      reason: "",
      isSubmitting: false,
      error: null,
    });
  }

  function closeCancelForm(): void {
    if (cancelActionState.isSubmitting) {
      return;
    }

    setCancelActionState({
      isOpen: false,
      reason: "",
      isSubmitting: false,
      error: null,
    });
  }

  async function handleCancelSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!token || loadState.status !== "success") {
      return;
    }

    const trimmedReason = cancelActionState.reason.trim();

    if (!trimmedReason) {
      setCancelActionState((current) => ({
        ...current,
        error: "El motivo de anulación es obligatorio.",
      }));

      return;
    }

    setCancelActionState((current) => ({
      ...current,
      isSubmitting: true,
      error: null,
    }));

    try {
      const updated = await cancelSale(token, loadState.sale.id, trimmedReason);

      setLoadState({ status: "success", sale: updated, message: null });

      setCancelActionState({
        isOpen: false,
        reason: "",
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
          ? "Este usuario no tiene permisos para anular ventas."
          : getErrorMessage(error);

      setCancelActionState((current) => ({
        ...current,
        isSubmitting: false,
        error: message,
      }));
    }
  }

  if (!Number.isInteger(saleId) || saleId <= 0) {
    return (
      <AppShell
        title="Venta no válida"
        description="La dirección proporcionada no identifica una venta."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione una venta válida."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/sales");
              }}
            >
              Volver a ventas
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (authStatus === "authenticated" && user && !hasSalesAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de ventas."
      >
        <StatePanel
          title="No tiene acceso a la venta"
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
          ? loadState.sale.customer_detail?.display_name ?? "Venta de mostrador"
          : "Detalle de venta"
      }
      description={
        loadState.status === "success"
          ? `Venta #${loadState.sale.id}`
          : "Información registrada de la venta."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {loadState.status === "success" &&
            loadState.sale.status === "DRAFT" &&
            hasWriteAccess && (
              <Button
                type="button"
                onClick={() => {
                  router.push(`/sales/${loadState.sale.id}/edit`);
                }}
              >
                Editar venta
              </Button>
            )}

          {loadState.status === "success" &&
            loadState.sale.status === "DRAFT" &&
            hasWriteAccess && (
              <Button
                type="button"
                variant="secondary"
                isLoading={confirmActionState.isSubmitting}
                loadingText="Confirmando…"
                disabled={loadState.sale.items.length === 0}
                title={
                  loadState.sale.items.length === 0
                    ? "Agregue al menos una línea antes de confirmar."
                    : undefined
                }
                onClick={() => {
                  void handleConfirmSale();
                }}
              >
                Confirmar venta
              </Button>
            )}

          {loadState.status === "success" &&
            (loadState.sale.status === "DRAFT" ||
              loadState.sale.status === "CONFIRMED") &&
            hasWriteAccess &&
            !cancelActionState.isOpen && (
              <Button type="button" variant="danger" onClick={openCancelForm}>
                Anular venta
              </Button>
            )}

          <Button type="button" variant="secondary" onClick={goBack}>
            <ArrowLeftIcon />
            Volver
          </Button>
        </div>
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando venta…" />}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Venta no encontrada"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/sales");
              }}
            >
              Volver al listado
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar la venta"
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
          {confirmActionState.error && <FormError message={confirmActionState.error} />}

          {cancelActionState.isOpen && (
            <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[rgb(215_0_21_/_18%)]">
              <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-danger">
                  Anular venta
                </h2>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Esta acción no se puede deshacer. Si la venta ya fue confirmada, se repondrá el inventario despachado.
                </p>
              </div>

              <form onSubmit={handleCancelSubmit} className="grid gap-4 p-5 sm:p-6">
                {cancelActionState.error && <FormError message={cancelActionState.error} />}

                <Field id="sale-cancel-reason" label="Motivo de anulación" required>
                  <Textarea
                    id="sale-cancel-reason"
                    value={cancelActionState.reason}
                    onChange={(event) => {
                      const reason = event.target.value;

                      setCancelActionState((current) => ({ ...current, reason }));
                    }}
                    disabled={cancelActionState.isSubmitting}
                    autoFocus
                  />
                </Field>

                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={closeCancelForm}
                    disabled={cancelActionState.isSubmitting}
                  >
                    Cancelar
                  </Button>

                  <Button
                    type="submit"
                    variant="danger"
                    isLoading={cancelActionState.isSubmitting}
                    loadingText="Anulando…"
                  >
                    Confirmar anulación
                  </Button>
                </div>
              </form>
            </section>
          )}

          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-foreground">
                  {loadState.sale.customer_detail?.display_name ?? "Venta de mostrador"}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {loadState.sale.notes || "Sin notas registradas."}
                </p>

                {loadState.sale.status === "CANCELLED" && (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-danger">
                    Motivo de anulación: {loadState.sale.cancellation_reason}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <span
                  className={[
                    "inline-flex w-fit items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                    STATUS_BADGE_CLASSES[loadState.sale.status],
                  ].join(" ")}
                >
                  {STATUS_LABELS[loadState.sale.status]}
                </span>

                <span
                  className={[
                    "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                    loadState.sale.is_active
                      ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                      : "bg-surface-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {loadState.sale.is_active ? "Activa" : "Inactiva"}
                </span>
              </div>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Fecha de venta</dt>
                <dd>{loadState.sale.sale_date}</dd>
              </div>

              <div className="app-status-row">
                <dt>Moneda</dt>
                <dd>{loadState.sale.currency}</dd>
              </div>

              <div className="app-status-row">
                <dt>Tipo de cambio</dt>
                <dd>{formatMoney(loadState.sale.exchange_rate)}</dd>
              </div>

              <div className="app-status-row">
                <dt>Total de la venta</dt>
                <dd>
                  <p className="leading-tight">
                    {formatMoney(loadState.sale.total)} {loadState.sale.currency}
                  </p>

                  {loadState.sale.currency === "USD" &&
                    crcEquivalent(loadState.sale.total, loadState.sale.exchange_rate) && (
                      <p className="leading-tight text-xs font-normal text-muted-foreground">
                        {crcEquivalent(loadState.sale.total, loadState.sale.exchange_rate)}
                      </p>
                    )}
                </dd>
              </div>

              {loadState.sale.confirmed_at && (
                <div className="app-status-row">
                  <dt>Confirmada</dt>
                  <dd>{formatDate(loadState.sale.confirmed_at)}</dd>
                </div>
              )}

              {loadState.sale.cancelled_at && (
                <div className="app-status-row">
                  <dt>Anulada</dt>
                  <dd>{formatDate(loadState.sale.cancelled_at)}</dd>
                </div>
              )}

              <div className="app-status-row">
                <dt>Fecha de creación</dt>
                <dd>{formatDate(loadState.sale.created_at)}</dd>
              </div>

              <div className="app-status-row">
                <dt>Última modificación</dt>
                <dd>{formatDate(loadState.sale.updated_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[var(--color-border-soft)] p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  Líneas de la venta
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Productos incluidos en esta venta.
                </p>
              </div>

              {canManageItems && itemFormState.mode === "closed" && (
                <Button type="button" onClick={openCreateItemForm}>
                  Agregar línea
                </Button>
              )}
            </div>

            {!canManageItems && loadState.sale.status !== "DRAFT" && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-4">
                <p className="text-sm text-muted-foreground">
                  Las líneas de una venta {loadState.sale.status === "CONFIRMED" ? "confirmada" : "anulada"} no pueden modificarse.
                </p>
              </div>
            )}

            {itemActionState.submitError && itemFormState.mode === "closed" && (
              <div className="border-b border-[var(--color-border-soft)] p-6">
                <FormError message={itemActionState.submitError} />
              </div>
            )}

            {itemFormState.mode !== "closed" && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-6">
                <div className="mb-5">
                  <h3 className="text-base font-semibold text-foreground">
                    {itemFormState.mode === "create" ? "Agregar línea" : "Editar línea"}
                  </h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {itemFormState.mode === "create"
                      ? "Busque el producto a vender."
                      : "Actualice la cantidad o el precio unitario."}
                  </p>
                </div>

                <SaleItemForm
                  key={itemFormKey}
                  mode={itemFormState.mode}
                  initialValues={itemFormInitialValues}
                  productDisplayLabel={itemDisplayLabel}
                  token={token ?? ""}
                  isSubmitting={itemActionState.isSubmitting}
                  submitError={itemActionState.submitError}
                  serverErrors={itemActionState.fieldErrors}
                  onSubmit={handleItemSubmit}
                  onCancel={closeItemForm}
                />
              </div>
            )}

            {loadState.sale.items.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Esta venta todavía no tiene líneas registradas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Producto
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Cantidad
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Precio unitario
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Subtotal
                      </th>

                      {canManageItems && (
                        <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Acciones
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {loadState.sale.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[var(--color-border-soft)] last:border-b-0"
                      >
                        <td className="px-5 py-4">
                          <p className="font-mono text-sm font-semibold text-foreground">
                            {item.product_detail.standard_code}
                          </p>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.product_detail.name}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">{item.quantity}</td>

                        <td className="px-5 py-4 text-sm text-foreground">
                          {formatMoney(item.unit_price)}
                        </td>

                        <td className="px-5 py-4 text-sm font-semibold text-foreground">
                          {formatMoney(item.subtotal)}
                        </td>

                        {canManageItems && (
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  openEditItemForm(item);
                                }}
                                disabled={
                                  itemActionState.isSubmitting ||
                                  itemActionState.pendingDeleteItemId !== null
                                }
                              >
                                Editar
                              </Button>

                              <Button
                                type="button"
                                variant="danger"
                                isLoading={itemActionState.pendingDeleteItemId === item.id}
                                loadingText="Eliminando…"
                                onClick={() => {
                                  void handleDeleteItem(item);
                                }}
                                disabled={
                                  itemActionState.isSubmitting ||
                                  (itemActionState.pendingDeleteItemId !== null &&
                                    itemActionState.pendingDeleteItemId !== item.id)
                                }
                              >
                                Eliminar
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
          </section>
        </div>
      )}
    </AppShell>
  );
}
