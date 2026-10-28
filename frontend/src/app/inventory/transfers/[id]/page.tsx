"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { Field } from "@/components/forms/field";
import { ArrowLeftIcon, DownloadIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth-context";
import {
  canCancelTransfers,
  canReadTransfers,
  canWriteTransfers,
} from "@/features/auth/permissions";
import type { Product } from "@/features/inventory/products/types";
import { formatDate, formatDateOnly } from "@/features/inventory/purchases/format";
import {
  cancelStockTransfer,
  confirmStockTransfer,
  createStockTransferItem,
  deleteStockTransfer,
  deleteStockTransferItem,
  getStockTransfer,
  getStockTransferGuidePdf,
  updateStockTransfer,
  updateStockTransferItem,
} from "@/features/inventory/transfers/api";
import { StockTransferForm } from "@/features/inventory/transfers/stock-transfer-form";
import { StockTransferItemForm } from "@/features/inventory/transfers/stock-transfer-item-form";
import {
  buildStockTransferWritePayload,
  mapStockTransferApiFieldErrors,
  STOCK_TRANSFER_STATUS_BADGE_CLASSES,
  STOCK_TRANSFER_STATUS_LABELS,
  stockTransferFormValues,
  type StockTransfer,
  type StockTransferFormErrors,
  type StockTransferFormValues,
  type StockTransferItem,
} from "@/features/inventory/transfers/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";
import { goBackOr } from "@/lib/navigation/go-back";

type LoadState =
  | { status: "loading" }
  | { status: "success"; transfer: StockTransfer }
  | { status: "not-found" | "error"; message: string };

const HEADER_CLASSES =
  "px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiTimeoutError) {
    return "La operación tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return fallback;
}

function downloadBlob(blob: Blob, filename: string): void {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  globalThis.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 1_000);
}

/**
 * Detalle de un traslado a otra sede (punto 6 del plan del 2026-10-22):
 * en borrador se arman las líneas; "Confirmar traslado" saca la mercadería
 * del inventario; "Anular" la devuelve (con motivo). La guía en PDF sale
 * en cualquier estado.
 */
export default function StockTransferDetailPage() {
  const params = useParams<{ id: string }>();

  const router = useRouter();

  const transferId = Number(params.id);

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const [actionError, setActionError] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<
    "confirm" | "delete" | "guide" | null
  >(null);

  const [isEditing, setIsEditing] = useState(false);

  const [editState, setEditState] = useState<{
    isSubmitting: boolean;
    submitError: string | null;
    serverErrors: StockTransferFormErrors;
  }>({ isSubmitting: false, submitError: null, serverErrors: {} });

  const [itemState, setItemState] = useState<{
    isSubmitting: boolean;
    submitError: string | null;
  }>({ isSubmitting: false, submitError: null });

  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  const [editingQuantity, setEditingQuantity] = useState("");

  const [pendingItemId, setPendingItemId] = useState<number | null>(null);

  const [itemRowError, setItemRowError] = useState<string | null>(null);

  const [cancelState, setCancelState] = useState<{
    isOpen: boolean;
    reason: string;
    isSubmitting: boolean;
    error: string | null;
  }>({ isOpen: false, reason: "", isSubmitting: false, error: null });

  const hasAccess = user ? canReadTransfers(user) : false;

  const hasWriteAccess = user ? canWriteTransfers(user) : false;

  const hasCancelAccess = user ? canCancelTransfers(user) : false;

  useEffect(() => {
    if (authStatus !== "authenticated" || !token || !hasAccess) {
      return;
    }

    const controller = new AbortController();

    getStockTransfer(token, transferId, controller.signal)
      .then((transfer) => {
        if (!controller.signal.aborted) {
          setLoadState({ status: "success", transfer });
        }
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

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({ status: "not-found", message: "El traslado no existe o fue eliminado." });
          return;
        }

        setLoadState({
          status: "error",
          message: getErrorMessage(error, "No fue posible consultar el traslado."),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasAccess, logout, router, token, transferId]);

  function setTransfer(transfer: StockTransfer): void {
    setLoadState({ status: "success", transfer });
  }

  async function handleUnauthorized(error: unknown): Promise<boolean> {
    if (error instanceof ApiError && error.status === 401) {
      await logout();
      router.replace("/login");
      return true;
    }

    return false;
  }

  // Después de cambiar una línea se pide el traslado de nuevo: el total
  // de unidades lo calcula el backend.
  async function reloadTransfer(): Promise<void> {
    if (!token) {
      return;
    }

    setTransfer(await getStockTransfer(token, transferId));
  }

  async function handleEditSubmit(values: StockTransferFormValues): Promise<void> {
    if (!token) {
      return;
    }

    setEditState({ isSubmitting: true, submitError: null, serverErrors: {} });

    try {
      setTransfer(await updateStockTransfer(token, transferId, buildStockTransferWritePayload(values)));
      setIsEditing(false);
      setEditState({ isSubmitting: false, submitError: null, serverErrors: {} });
    } catch (error) {
      if (await handleUnauthorized(error)) {
        return;
      }

      setEditState({
        isSubmitting: false,
        submitError: getErrorMessage(error, "No fue posible guardar el traslado."),
        serverErrors:
          error instanceof ApiError ? mapStockTransferApiFieldErrors(error.fieldErrors) : {},
      });
    }
  }

  async function handleAddItem(product: Product, quantity: number): Promise<boolean> {
    if (!token) {
      return false;
    }

    setItemState({ isSubmitting: true, submitError: null });

    try {
      await createStockTransferItem(token, {
        stock_transfer: transferId,
        product: product.id,
        quantity,
      });
      await reloadTransfer();
      setItemState({ isSubmitting: false, submitError: null });
      return true;
    } catch (error) {
      if (await handleUnauthorized(error)) {
        return false;
      }

      setItemState({
        isSubmitting: false,
        submitError: getErrorMessage(error, "No fue posible agregar el producto."),
      });
      return false;
    }
  }

  function startEditingItem(item: StockTransferItem): void {
    setEditingItemId(item.id);
    setEditingQuantity(String(item.quantity));
    setItemRowError(null);
  }

  async function handleSaveItem(item: StockTransferItem): Promise<void> {
    if (!token) {
      return;
    }

    const quantity = Number(editingQuantity);

    if (!/^\d+$/.test(editingQuantity.trim()) || quantity < 1) {
      setItemRowError("La cantidad es un número entero mayor que 0.");
      return;
    }

    setPendingItemId(item.id);
    setItemRowError(null);

    try {
      await updateStockTransferItem(token, item.id, quantity);
      await reloadTransfer();
      setEditingItemId(null);
    } catch (error) {
      if (await handleUnauthorized(error)) {
        return;
      }

      setItemRowError(getErrorMessage(error, "No fue posible cambiar la cantidad."));
    } finally {
      setPendingItemId(null);
    }
  }

  async function handleRemoveItem(item: StockTransferItem): Promise<void> {
    if (
      !token ||
      !confirmWithFocusRestore(
        `¿Quitar ${item.product_detail.standard_code} — ${item.product_detail.name} del traslado?`,
      )
    ) {
      return;
    }

    setPendingItemId(item.id);
    setItemRowError(null);

    try {
      await deleteStockTransferItem(token, item.id);
      await reloadTransfer();
    } catch (error) {
      if (await handleUnauthorized(error)) {
        return;
      }

      setItemRowError(getErrorMessage(error, "No fue posible quitar el producto."));
    } finally {
      setPendingItemId(null);
    }
  }

  async function handleConfirm(transfer: StockTransfer): Promise<void> {
    if (
      !token ||
      !confirmWithFocusRestore(
        `¿Confirmar el traslado a ${transfer.branch_detail.name}? ` +
          `Salen del inventario ${transfer.total_quantity} unidades de ` +
          `${transfer.items.length} ${transfer.items.length === 1 ? "producto" : "productos"}.`,
      )
    ) {
      return;
    }

    setPendingAction("confirm");
    setActionError(null);

    try {
      setTransfer(await confirmStockTransfer(token, transferId));
    } catch (error) {
      if (await handleUnauthorized(error)) {
        return;
      }

      setActionError(getErrorMessage(error, "No fue posible confirmar el traslado."));
      // El botón está al final; el mensaje (qué falta y cuánto hay), arriba.
      globalThis.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete(): Promise<void> {
    if (
      !token ||
      !confirmWithFocusRestore("¿Eliminar este borrador de traslado? No mueve inventario.")
    ) {
      return;
    }

    setPendingAction("delete");
    setActionError(null);

    try {
      await deleteStockTransfer(token, transferId);
      router.replace("/inventory/transfers");
    } catch (error) {
      if (await handleUnauthorized(error)) {
        return;
      }

      setActionError(getErrorMessage(error, "No fue posible eliminar el traslado."));
      setPendingAction(null);
    }
  }

  async function handleDownloadGuide(): Promise<void> {
    if (!token) {
      return;
    }

    setPendingAction("guide");
    setActionError(null);

    try {
      downloadBlob(
        await getStockTransferGuidePdf(token, transferId),
        `guia-traslado-${transferId}.pdf`,
      );
    } catch (error) {
      if (await handleUnauthorized(error)) {
        return;
      }

      setActionError(getErrorMessage(error, "No fue posible generar la guía."));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCancelSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!token) {
      return;
    }

    if (!cancelState.reason.trim()) {
      setCancelState((current) => ({ ...current, error: "El motivo de anulación es obligatorio." }));
      return;
    }

    setCancelState((current) => ({ ...current, isSubmitting: true, error: null }));

    try {
      setTransfer(await cancelStockTransfer(token, transferId, cancelState.reason.trim()));
      setCancelState({ isOpen: false, reason: "", isSubmitting: false, error: null });
    } catch (error) {
      if (await handleUnauthorized(error)) {
        return;
      }

      setCancelState((current) => ({
        ...current,
        isSubmitting: false,
        error: getErrorMessage(error, "No fue posible anular el traslado."),
      }));
    }
  }

  if (authStatus === "authenticated" && user && !hasAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Los traslados a otra sede los hace el Administrador."
      >
        <StatePanel
          title="No tiene acceso a los traslados"
          message="Los permisos de cada usuario los asigna el Administrador."
          tone="warning"
        />
      </AppShell>
    );
  }

  const transfer = loadState.status === "success" ? loadState.transfer : null;

  const isDraft = transfer?.status === "DRAFT";

  const canEditLines = isDraft && hasWriteAccess;

  return (
    <AppShell
      title={transfer ? `Traslado #${transfer.id}` : "Traslado"}
      description={
        transfer
          ? `A ${transfer.branch_detail.name}, ${formatDateOnly(transfer.transfer_date)}.`
          : "Mercadería que sale hacia otra sede."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {transfer && (
            <Button
              type="button"
              variant="secondary"
              isLoading={pendingAction === "guide"}
              loadingText="Generando…"
              onClick={() => {
                void handleDownloadGuide();
              }}
            >
              <DownloadIcon />
              Guía de traslado
            </Button>
          )}

          {transfer && isDraft && hasWriteAccess && !isEditing && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsEditing(true);
              }}
            >
              Editar datos
            </Button>
          )}

          {transfer && isDraft && hasWriteAccess && (
            <Button
              type="button"
              variant="danger"
              isLoading={pendingAction === "delete"}
              loadingText="Eliminando…"
              onClick={() => {
                void handleDelete();
              }}
            >
              Eliminar borrador
            </Button>
          )}

          {transfer?.status === "CONFIRMED" && hasCancelAccess && !cancelState.isOpen && (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setCancelState({ isOpen: true, reason: "", isSubmitting: false, error: null });
              }}
            >
              Anular traslado
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              goBackOr(router, "/inventory/transfers");
            }}
          >
            <ArrowLeftIcon />
            Volver
          </Button>
        </div>
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando traslado…" />}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Traslado no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/inventory/transfers");
              }}
            >
              Volver a traslados
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el traslado"
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

      {transfer && token && (
        <div className="grid gap-6">
          {actionError && <FormError message={actionError} />}

          {cancelState.isOpen && (
            <section className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-[rgb(215_0_21_/_18%)]">
              <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-danger">
                  Anular traslado
                </h2>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  La mercadería vuelve al inventario. No se puede deshacer; el motivo queda en el
                  traslado, en la guía y en Movimientos.
                </p>
              </div>

              <form
                onSubmit={(event) => {
                  void handleCancelSubmit(event);
                }}
                noValidate
                className="grid gap-4 p-5 sm:p-6"
              >
                {cancelState.error && <FormError message={cancelState.error} />}

                <Field id="stock-transfer-cancel-reason" label="Motivo de anulación" required>
                  <Textarea
                    id="stock-transfer-cancel-reason"
                    value={cancelState.reason}
                    onChange={(event) => {
                      const reason = event.target.value;

                      setCancelState((current) => ({ ...current, reason, error: null }));
                    }}
                    disabled={cancelState.isSubmitting}
                    autoFocus
                  />
                </Field>

                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setCancelState({ isOpen: false, reason: "", isSubmitting: false, error: null });
                    }}
                    disabled={cancelState.isSubmitting}
                  >
                    Cancelar
                  </Button>

                  <Button
                    type="submit"
                    variant="danger"
                    isLoading={cancelState.isSubmitting}
                    loadingText="Anulando…"
                  >
                    Confirmar anulación
                  </Button>
                </div>
              </form>
            </section>
          )}

          {isEditing ? (
            <StockTransferForm
              mode="edit"
              token={token}
              initialValues={stockTransferFormValues(transfer)}
              isSubmitting={editState.isSubmitting}
              submitError={editState.submitError}
              serverErrors={editState.serverErrors}
              onSubmit={handleEditSubmit}
              onCancel={() => {
                setIsEditing(false);
                setEditState({ isSubmitting: false, submitError: null, serverErrors: {} });
              }}
            />
          ) : (
            <section className="app-status-card overflow-hidden">
              <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.025em] text-foreground">
                    {transfer.branch_detail.name}
                  </h2>

                  <p className="mt-2 max-w-3xl whitespace-pre-line text-sm leading-6 text-muted-foreground">
                    {transfer.notes || "Sin notas."}
                  </p>

                  {transfer.status === "CANCELLED" && transfer.cancellation_reason && (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-danger">
                      Motivo de anulación: {transfer.cancellation_reason}
                    </p>
                  )}
                </div>

                <span
                  className={[
                    "inline-flex w-fit shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                    STOCK_TRANSFER_STATUS_BADGE_CLASSES[transfer.status],
                  ].join(" ")}
                >
                  {STOCK_TRANSFER_STATUS_LABELS[transfer.status]}
                </span>
              </div>

              <dl className="border-t border-[var(--color-border-soft)]">
                <div className="app-status-row">
                  <dt>Fecha del traslado</dt>
                  <dd>{formatDateOnly(transfer.transfer_date)}</dd>
                </div>

                <div className="app-status-row">
                  <dt>Productos</dt>
                  <dd>
                    {transfer.items.length}{" "}
                    {transfer.items.length === 1 ? "producto" : "productos"} ·{" "}
                    {transfer.total_quantity} unidades
                  </dd>
                </div>

                <div className="app-status-row">
                  <dt>Creado</dt>
                  <dd>
                    {formatDate(transfer.created_at)}
                    {transfer.created_by_username && ` por ${transfer.created_by_username}`}
                  </dd>
                </div>

                {transfer.confirmed_at && (
                  <div className="app-status-row">
                    <dt>Confirmado</dt>
                    <dd>
                      {formatDate(transfer.confirmed_at)}
                      {transfer.confirmed_by_username && ` por ${transfer.confirmed_by_username}`}
                    </dd>
                  </div>
                )}

                {transfer.cancelled_at && (
                  <div className="app-status-row">
                    <dt>Anulado</dt>
                    <dd>
                      {formatDate(transfer.cancelled_at)}
                      {transfer.cancelled_by_username && ` por ${transfer.cancelled_by_username}`}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* Sin overflow-hidden mientras se agregan productos: cortaría la
              lista de resultados del buscador, que se despliega hacia abajo. */}
          <section className={`app-status-card ${canEditLines ? "" : "overflow-hidden"}`}>
            <div className="border-b border-[var(--color-border-soft)] p-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Productos
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {isDraft
                  ? "Salen del inventario al confirmar el traslado; para eso tiene que alcanzar la existencia de cada uno."
                  : transfer.status === "CONFIRMED"
                    ? "Salieron del inventario al confirmar el traslado."
                    : "Volvieron al inventario al anular el traslado."}
              </p>
            </div>

            {itemRowError && (
              <div className="border-b border-[var(--color-border-soft)] p-6">
                <FormError message={itemRowError} />
              </div>
            )}

            {transfer.items.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Este traslado todavía no tiene productos.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className={HEADER_CLASSES}>Código</th>
                      <th className={HEADER_CLASSES}>Producto</th>
                      <th className={HEADER_CLASSES}>Ubicación</th>
                      <th className={`${HEADER_CLASSES} text-right`}>Cantidad</th>
                      {canEditLines && <th className={`${HEADER_CLASSES} text-right`}>Acciones</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {transfer.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[var(--color-border-soft)] last:border-b-0"
                      >
                        <td className="whitespace-nowrap px-5 py-4 align-top">
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {item.product_detail.standard_code}
                          </span>

                          {item.product_detail.own_code && (
                            <p className="mt-1 font-mono text-xs text-muted-foreground">
                              Propio: {item.product_detail.own_code}
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4 align-top text-sm font-semibold text-foreground">
                          {item.product_detail.name}
                        </td>

                        <td className="px-5 py-4 align-top">
                          <span className="inline-flex rounded-[var(--radius-sm)] bg-surface-muted px-2.5 py-1 font-mono text-sm font-semibold text-foreground">
                            {item.product_detail.location_code}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right align-top font-mono text-sm font-semibold text-foreground">
                          {editingItemId === item.id ? (
                            <Input
                              value={editingQuantity}
                              onChange={(event) => {
                                setEditingQuantity(event.target.value);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void handleSaveItem(item);
                                }

                                if (event.key === "Escape") {
                                  setEditingItemId(null);
                                }
                              }}
                              inputMode="numeric"
                              aria-label={`Cantidad de ${item.product_detail.standard_code}`}
                              className="ml-auto h-10 w-20 text-right"
                              autoFocus
                              disabled={pendingItemId === item.id}
                            />
                          ) : (
                            `${item.quantity} ${item.product_detail.unit_of_measure}`
                          )}
                        </td>

                        {canEditLines && (
                          <td className="px-5 py-3 align-top">
                            <div className="flex justify-end gap-2">
                              {editingItemId === item.id ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingItemId(null);
                                    }}
                                    disabled={pendingItemId === item.id}
                                  >
                                    Cancelar
                                  </Button>

                                  <Button
                                    type="button"
                                    isLoading={pendingItemId === item.id}
                                    loadingText="Guardando…"
                                    onClick={() => {
                                      void handleSaveItem(item);
                                    }}
                                  >
                                    Guardar
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                      startEditingItem(item);
                                    }}
                                    disabled={pendingItemId !== null || editingItemId !== null}
                                  >
                                    Editar
                                  </Button>

                                  <Button
                                    type="button"
                                    variant="danger"
                                    isLoading={pendingItemId === item.id}
                                    loadingText="Quitando…"
                                    onClick={() => {
                                      void handleRemoveItem(item);
                                    }}
                                    disabled={pendingItemId !== null || editingItemId !== null}
                                  >
                                    Quitar
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {canEditLines && (
              <div className="border-t border-[var(--color-border-soft)] p-6">
                <StockTransferItemForm
                  token={token}
                  isSubmitting={itemState.isSubmitting}
                  submitError={itemState.submitError}
                  onSubmit={handleAddItem}
                />
              </div>
            )}
          </section>

          {isDraft && hasWriteAccess && (
            <Button
              type="button"
              className="w-full"
              isLoading={pendingAction === "confirm"}
              loadingText="Confirmando…"
              disabled={transfer.items.length === 0 || isEditing}
              onClick={() => {
                void handleConfirm(transfer);
              }}
            >
              Confirmar traslado
            </Button>
          )}

          {isDraft && hasWriteAccess && transfer.items.length === 0 && (
            <p className="rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] px-5 py-4 text-sm font-medium text-[var(--color-primary)] ring-1 ring-[rgb(7_81_132_/_12%)]">
              Sin productos. La confirmación se habilita al agregar al menos uno.
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}
