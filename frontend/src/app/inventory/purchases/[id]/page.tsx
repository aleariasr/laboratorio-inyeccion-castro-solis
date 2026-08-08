"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/form-error";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canReadInventory, canWriteInventory } from "@/features/auth/permissions";
import {
  createPurchaseItem,
  deletePurchaseItem,
  getPurchase,
  updatePurchaseItem,
} from "@/features/inventory/purchases/api";
import { mapPurchaseItemApiFieldErrors } from "@/features/inventory/purchases/purchase-item-form-errors";
import { PurchaseItemForm } from "@/features/inventory/purchases/purchase-item-form";
import {
  buildPurchaseItemWritePayload,
  EMPTY_PURCHASE_ITEM_FORM_VALUES,
  type Purchase,
  type PurchaseItemFormErrors,
  type PurchaseItemFormValues,
  type PurchaseItemInline,
  type PurchaseStatus,
} from "@/features/inventory/purchases/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      purchase: null;
      message: null;
    }
  | {
      status: "success";
      purchase: Purchase;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      purchase: null;
      message: string;
    };

type ItemFormState =
  | { mode: "closed"; item: null }
  | { mode: "create"; item: null }
  | { mode: "edit"; item: PurchaseItemInline };

type ItemActionState = {
  isSubmitting: boolean;
  submitError: string | null;
  fieldErrors: PurchaseItemFormErrors;
  pendingDeleteItemId: number | null;
};

const STATUS_LABELS: Record<PurchaseStatus, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmada",
  CANCELLED: "Anulada",
};

const STATUS_BADGE_CLASSES: Record<PurchaseStatus, string> = {
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

  return "No fue posible consultar la compra.";
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

function formatItemLabel(item: PurchaseItemInline): string {
  return `${item.supplier_product_detail.product.standard_code} — ${item.supplier_product_detail.product.name}`;
}

export default function PurchaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    purchase: null,
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

  const purchaseId = Number(params.id);

  const hasInventoryAccess = user ? canReadInventory(user) : false;

  const hasWriteAccess = user ? canWriteInventory(user) : false;

  const canManageItems =
    loadState.status === "success" &&
    loadState.purchase.status === "DRAFT" &&
    hasWriteAccess;

  const itemFormInitialValues =
    itemFormState.mode === "edit"
      ? {
          supplierProductId: String(itemFormState.item.supplier_product),
          quantity: String(itemFormState.item.quantity),
          unitCost: itemFormState.item.unit_cost,
        }
      : EMPTY_PURCHASE_ITEM_FORM_VALUES;

  const itemFormKey =
    itemFormState.mode === "edit" ? `edit-${itemFormState.item.id}` : "create";

  const itemDisplayLabel =
    itemFormState.mode === "edit" ? formatItemLabel(itemFormState.item) : undefined;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasInventoryAccess ||
      !Number.isInteger(purchaseId) ||
      purchaseId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getPurchase(token, purchaseId, controller.signal)
      .then((purchase) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", purchase, message: null });
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
            purchase: null,
            message: "Este usuario no tiene permisos para consultar compras.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            purchase: null,
            message: "La compra solicitada no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          purchase: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasInventoryAccess, logout, purchaseId, router, token]);

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

  function openEditItemForm(item: PurchaseItemInline): void {
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

  function updateItemsInState(updated: PurchaseItemInline): void {
    setLoadState((current) => {
      if (current.status !== "success") {
        return current;
      }

      const exists = current.purchase.items.some((item) => item.id === updated.id);

      const items = exists
        ? current.purchase.items.map((item) => (item.id === updated.id ? updated : item))
        : [...current.purchase.items, updated];

      return {
        ...current,
        purchase: { ...current.purchase, items },
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
        purchase: {
          ...current.purchase,
          items: current.purchase.items.filter((item) => item.id !== itemId),
        },
      };
    });
  }

  async function handleItemSubmit(values: PurchaseItemFormValues): Promise<void> {
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
      const payload = buildPurchaseItemWritePayload(loadState.purchase.id, values);

      const saved =
        itemFormState.mode === "create"
          ? await createPurchaseItem(token, payload)
          : await updatePurchaseItem(token, itemFormState.item.id, {
              quantity: payload.quantity,
              unit_cost: payload.unit_cost,
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
          submitError: "Este usuario no tiene permisos para modificar líneas de compra.",
        }));

        return;
      }

      if (error instanceof ApiError) {
        const fieldErrors = mapPurchaseItemApiFieldErrors(error.fieldErrors);

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

  async function handleDeleteItem(item: PurchaseItemInline): Promise<void> {
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
      await deletePurchaseItem(token, item.id);

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
          ? "Este usuario no tiene permisos para eliminar líneas de compra."
          : getErrorMessage(error);

      setItemActionState((current) => ({
        ...current,
        submitError: message,
        pendingDeleteItemId: null,
      }));
    }
  }

  if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
    return (
      <AppShell
        title="Compra no válida"
        description="La dirección proporcionada no identifica una compra."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione una compra válida."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/inventory/purchases");
              }}
            >
              Volver a compras
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (authStatus === "authenticated" && user && !hasInventoryAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de inventario."
      >
        <StatePanel
          title="No tiene acceso a la compra"
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

  const total =
    loadState.status === "success"
      ? loadState.purchase.items.reduce((sum, item) => sum + Number(item.subtotal), 0)
      : 0;

  return (
    <AppShell
      title={
        loadState.status === "success" ? loadState.purchase.invoice_number : "Detalle de compra"
      }
      description={
        loadState.status === "success"
          ? loadState.purchase.supplier_detail.name
          : "Información registrada de la compra."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {loadState.status === "success" &&
            loadState.purchase.status === "DRAFT" &&
            hasWriteAccess && (
              <Button
                type="button"
                onClick={() => {
                  router.push(`/inventory/purchases/${loadState.purchase.id}/edit`);
                }}
              >
                Editar compra
              </Button>
            )}

          <Button type="button" variant="secondary" onClick={goBack}>
            <ArrowLeftIcon />
            Volver
          </Button>
        </div>
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando compra…" />}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Compra no encontrada"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/inventory/purchases");
              }}
            >
              Volver al listado
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar la compra"
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
          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-foreground">
                  {loadState.purchase.invoice_number}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {loadState.purchase.notes || "Sin notas registradas."}
                </p>

                {loadState.purchase.status === "CANCELLED" && (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-danger">
                    Motivo de anulación: {loadState.purchase.cancellation_reason}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <span
                  className={[
                    "inline-flex w-fit items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                    STATUS_BADGE_CLASSES[loadState.purchase.status],
                  ].join(" ")}
                >
                  {STATUS_LABELS[loadState.purchase.status]}
                </span>

                <span
                  className={[
                    "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                    loadState.purchase.is_active
                      ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                      : "bg-surface-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {loadState.purchase.is_active ? "Activa" : "Inactiva"}
                </span>
              </div>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Proveedor</dt>
                <dd>{loadState.purchase.supplier_detail.name}</dd>
              </div>

              <div className="app-status-row">
                <dt>Fecha de compra</dt>
                <dd>{loadState.purchase.purchase_date}</dd>
              </div>

              <div className="app-status-row">
                <dt>Moneda</dt>
                <dd>{loadState.purchase.currency}</dd>
              </div>

              <div className="app-status-row">
                <dt>Tipo de cambio</dt>
                <dd>{loadState.purchase.exchange_rate}</dd>
              </div>

              <div className="app-status-row">
                <dt>Total de la factura</dt>
                <dd>
                  {total.toFixed(2)} {loadState.purchase.currency}
                </dd>
              </div>

              {loadState.purchase.confirmed_at && (
                <div className="app-status-row">
                  <dt>Confirmada</dt>
                  <dd>{formatDate(loadState.purchase.confirmed_at)}</dd>
                </div>
              )}

              {loadState.purchase.cancelled_at && (
                <div className="app-status-row">
                  <dt>Anulada</dt>
                  <dd>{formatDate(loadState.purchase.cancelled_at)}</dd>
                </div>
              )}

              <div className="app-status-row">
                <dt>Fecha de creación</dt>
                <dd>{formatDate(loadState.purchase.created_at)}</dd>
              </div>

              <div className="app-status-row">
                <dt>Última modificación</dt>
                <dd>{formatDate(loadState.purchase.updated_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[var(--color-border-soft)] p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  Líneas de la compra
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Productos incluidos en esta factura.
                </p>
              </div>

              {canManageItems && itemFormState.mode === "closed" && (
                <Button type="button" onClick={openCreateItemForm}>
                  Agregar línea
                </Button>
              )}
            </div>

            {!canManageItems && loadState.purchase.status !== "DRAFT" && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-4">
                <p className="text-sm text-muted-foreground">
                  Las líneas de una compra {loadState.purchase.status === "CONFIRMED" ? "confirmada" : "anulada"} no pueden modificarse.
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
                      ? "Busque el producto de este proveedor."
                      : "Actualice la cantidad o el costo unitario."}
                  </p>
                </div>

                <PurchaseItemForm
                  key={itemFormKey}
                  mode={itemFormState.mode}
                  initialValues={itemFormInitialValues}
                  supplierId={loadState.purchase.supplier}
                  supplierProductDisplayLabel={itemDisplayLabel}
                  token={token ?? ""}
                  isSubmitting={itemActionState.isSubmitting}
                  submitError={itemActionState.submitError}
                  serverErrors={itemActionState.fieldErrors}
                  onSubmit={handleItemSubmit}
                  onCancel={closeItemForm}
                />
              </div>
            )}

            {loadState.purchase.items.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Esta compra todavía no tiene líneas registradas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Producto
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Referencia
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Cantidad
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Costo unitario
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
                    {loadState.purchase.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[var(--color-border-soft)] last:border-b-0"
                      >
                        <td className="px-5 py-4">
                          <p className="font-mono text-sm font-semibold text-foreground">
                            {item.supplier_product_detail.product.standard_code}
                          </p>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.supplier_product_detail.product.name}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">
                          {item.supplier_product_detail.supplier_reference || "Sin referencia"}
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">{item.quantity}</td>

                        <td className="px-5 py-4 text-sm text-foreground">{item.unit_cost}</td>

                        <td className="px-5 py-4 text-sm font-semibold text-foreground">
                          {item.subtotal}
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
