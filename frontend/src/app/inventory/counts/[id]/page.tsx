"use client";

import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { FormError } from "@/components/feedback/form-error";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canReadInventoryCounts, canWriteInventoryCounts } from "@/features/auth/permissions";
import {
  approveInventoryCount,
  cancelInventoryCount,
  createInventoryCountItem,
  deleteInventoryCount,
  deleteInventoryCountItem,
  getInventoryCount,
  getInventoryCountItems,
  updateInventoryCountItem,
} from "@/features/inventory/counts/api";
import { mapInventoryCountItemApiFieldErrors } from "@/features/inventory/counts/inventory-count-item-form-errors";
import type {
  InventoryCount,
  InventoryCountItem,
  InventoryCountItemFormErrors,
  InventoryCountStatus,
} from "@/features/inventory/counts/types";
import { getProducts } from "@/features/inventory/products/api";
import type { Product } from "@/features/inventory/products/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      inventoryCount: null;
      message: null;
    }
  | {
      status: "success";
      inventoryCount: InventoryCount;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      inventoryCount: null;
      message: string;
    };

type ItemsLoadState =
  | {
      status: "loading";
      items: null;
      message: null;
    }
  | {
      status: "success";
      items: InventoryCountItem[];
      message: null;
    }
  | {
      status: "error";
      items: null;
      message: string;
    };

type CaptureState = {
  query: string;
  results: Product[];
  isListOpen: boolean;
  searchError: string | null;
  selectedProduct: Product | null;
  quantity: string;
  isSubmitting: boolean;
  submitError: string | null;
  fieldErrors: InventoryCountItemFormErrors;
};

const EMPTY_CAPTURE_STATE: CaptureState = {
  query: "",
  results: [],
  isListOpen: false,
  searchError: null,
  selectedProduct: null,
  quantity: "",
  isSubmitting: false,
  submitError: null,
  fieldErrors: {},
};

type EditingQuantityState = {
  itemId: number;
  value: string;
  isSubmitting: boolean;
  error: string | null;
} | null;

type ApproveActionState = { isSubmitting: boolean; error: string | null };
type CancelActionState = { isSubmitting: boolean; error: string | null };
type DeleteCountState = { isSubmitting: boolean; error: string | null };

const STATUS_LABELS: Record<InventoryCountStatus, string> = {
  DRAFT: "Borrador",
  APPROVED: "Aprobado",
  CANCELLED: "Anulado",
};

const STATUS_BADGE_CLASSES: Record<InventoryCountStatus, string> = {
  DRAFT: "bg-surface-muted text-muted-foreground",
  APPROVED: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
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

  return "No fue posible consultar el conteo.";
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

function formatDifference(difference: number): string {
  if (difference > 0) {
    return `+${difference}`;
  }

  return String(difference);
}

function differenceClassName(difference: number): string {
  if (difference === 0) {
    return "text-muted-foreground";
  }

  if (difference > 0) {
    return "font-semibold text-[var(--color-success)]";
  }

  return "font-semibold text-danger";
}

export default function InventoryCountDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    inventoryCount: null,
    message: null,
  });

  const [itemsState, setItemsState] = useState<ItemsLoadState>({
    status: "loading",
    items: null,
    message: null,
  });

  const [itemsActionError, setItemsActionError] = useState<string | null>(null);

  const [captureState, setCaptureState] = useState<CaptureState>(EMPTY_CAPTURE_STATE);

  const [editingQuantity, setEditingQuantity] = useState<EditingQuantityState>(null);

  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<number | null>(null);

  const [approveState, setApproveState] = useState<ApproveActionState>({
    isSubmitting: false,
    error: null,
  });

  const [cancelState, setCancelState] = useState<CancelActionState>({
    isSubmitting: false,
    error: null,
  });

  const [deleteCountState, setDeleteCountState] = useState<DeleteCountState>({
    isSubmitting: false,
    error: null,
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  const quantityInputRef = useRef<HTMLInputElement>(null);

  const inventoryCountId = Number(params.id);

  const hasInventoryAccess = user ? canReadInventoryCounts(user) : false;

  const hasWriteAccess = user ? canWriteInventoryCounts(user) : false;

  const canManageItems =
    loadState.status === "success" &&
    loadState.inventoryCount.status === "DRAFT" &&
    hasWriteAccess;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasInventoryAccess ||
      !Number.isInteger(inventoryCountId) ||
      inventoryCountId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getInventoryCount(token, inventoryCountId, controller.signal)
      .then((inventoryCount) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", inventoryCount, message: null });
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
            inventoryCount: null,
            message: "Este usuario no tiene permisos para consultar conteos.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            inventoryCount: null,
            message: "El conteo solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          inventoryCount: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasInventoryAccess, inventoryCountId, logout, router, token]);

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasInventoryAccess ||
      !Number.isInteger(inventoryCountId) ||
      inventoryCountId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getInventoryCountItems(token, inventoryCountId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) {
          return;
        }

        setItemsState({ status: "success", items, message: null });
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

        setItemsState({
          status: "error",
          items: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasInventoryAccess, inventoryCountId, logout, router, token]);

  useEffect(() => {
    if (!canManageItems || !token) {
      return;
    }

    const trimmedQuery = captureState.query.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      getProducts(
        token,
        {
          query: trimmedQuery,
          activeState: "active",
          page: 1,
          pageSize: 20,
        },
        controller.signal,
      )
        .then((response) => {
          if (controller.signal.aborted) {
            return;
          }

          setCaptureState((current) => ({
            ...current,
            results: response.results,
            searchError: null,
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setCaptureState((current) => ({
            ...current,
            searchError: "No fue posible buscar productos.",
          }));
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [canManageItems, captureState.query, token]);

  useEffect(() => {
    if (captureState.selectedProduct) {
      quantityInputRef.current?.focus();
    }
  }, [captureState.selectedProduct]);

  function goBack(): void {
    router.back();
  }

  function selectProduct(product: Product): void {
    setCaptureState((current) => {
      const nextFieldErrors = { ...current.fieldErrors };

      delete nextFieldErrors.productId;

      return {
        ...current,
        selectedProduct: product,
        query: "",
        results: [],
        isListOpen: false,
        fieldErrors: nextFieldErrors,
      };
    });
  }

  function clearSelectedProduct(): void {
    setCaptureState((current) => ({
      ...current,
      selectedProduct: null,
      query: "",
      results: [],
    }));

    searchInputRef.current?.focus();
  }

  function resetCapture(): void {
    setCaptureState(EMPTY_CAPTURE_STATE);
    searchInputRef.current?.focus();
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();

      if (captureState.results.length > 0) {
        selectProduct(captureState.results[0]);
      }
    }
  }

  function handleQuantityKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleAddItem();
    }
  }

  async function handleAddItem(): Promise<void> {
    if (
      !token ||
      loadState.status !== "success" ||
      itemsState.status !== "success" ||
      !captureState.selectedProduct
    ) {
      return;
    }

    const selectedProduct = captureState.selectedProduct;

    const quantityValue = captureState.quantity.trim();

    const validationErrors: InventoryCountItemFormErrors = {};

    if (!quantityValue) {
      validationErrors.countedQuantity = "La cantidad contada es obligatoria.";
    } else if (!/^\d+$/.test(quantityValue)) {
      validationErrors.countedQuantity =
        "La cantidad contada debe ser un número entero mayor o igual a cero.";
    }

    const isDuplicate = itemsState.items.some(
      (item) => item.product === selectedProduct.id,
    );

    if (isDuplicate) {
      validationErrors.productId = "Este producto ya está registrado en el conteo.";
    }

    if (Object.keys(validationErrors).length > 0) {
      setCaptureState((current) => ({ ...current, fieldErrors: validationErrors }));
      return;
    }

    setCaptureState((current) => ({
      ...current,
      isSubmitting: true,
      submitError: null,
      fieldErrors: {},
    }));

    try {
      const created = await createInventoryCountItem(token, {
        inventory_count: loadState.inventoryCount.id,
        product: selectedProduct.id,
        counted_quantity: Number(quantityValue),
      });

      setItemsState((current) =>
        current.status === "success"
          ? { status: "success", items: [...current.items, created], message: null }
          : current,
      );

      resetCapture();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setCaptureState((current) => ({
          ...current,
          isSubmitting: false,
          submitError: "Este usuario no tiene permisos para modificar líneas de conteo.",
        }));

        return;
      }

      if (error instanceof ApiError) {
        const fieldErrors = mapInventoryCountItemApiFieldErrors(error.fieldErrors);

        setCaptureState((current) => ({
          ...current,
          isSubmitting: false,
          submitError: Object.keys(fieldErrors).length > 0 ? null : error.message,
          fieldErrors,
        }));

        return;
      }

      setCaptureState((current) => ({
        ...current,
        isSubmitting: false,
        submitError: getErrorMessage(error),
      }));
    }
  }

  async function handleDeleteItem(item: InventoryCountItem): Promise<void> {
    if (!token) {
      return;
    }

    if (
      !globalThis.confirm(
        `¿Eliminar la línea de ${item.product_detail.standard_code} — ${item.product_detail.name}?`,
      )
    ) {
      return;
    }

    setItemsActionError(null);
    setPendingDeleteItemId(item.id);

    try {
      await deleteInventoryCountItem(token, item.id);

      setItemsState((current) =>
        current.status === "success"
          ? {
              status: "success",
              items: current.items.filter((existing) => existing.id !== item.id),
              message: null,
            }
          : current,
      );

      setPendingDeleteItemId(null);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para eliminar líneas de conteo."
          : getErrorMessage(error);

      setItemsActionError(message);
      setPendingDeleteItemId(null);
    }
  }

  function startEditQuantity(item: InventoryCountItem): void {
    setEditingQuantity({
      itemId: item.id,
      value: String(item.counted_quantity),
      isSubmitting: false,
      error: null,
    });
  }

  function cancelEditQuantity(): void {
    setEditingQuantity(null);
  }

  async function handleSaveQuantity(): Promise<void> {
    if (!token || !editingQuantity) {
      return;
    }

    const trimmedValue = editingQuantity.value.trim();

    if (!trimmedValue || !/^\d+$/.test(trimmedValue)) {
      setEditingQuantity((current) =>
        current
          ? { ...current, error: "Ingrese un número entero mayor o igual a cero." }
          : current,
      );

      return;
    }

    setEditingQuantity((current) =>
      current ? { ...current, isSubmitting: true, error: null } : current,
    );

    try {
      const updated = await updateInventoryCountItem(token, editingQuantity.itemId, {
        counted_quantity: Number(trimmedValue),
      });

      setItemsState((current) =>
        current.status === "success"
          ? {
              status: "success",
              items: current.items.map((item) => (item.id === updated.id ? updated : item)),
              message: null,
            }
          : current,
      );

      setEditingQuantity(null);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para modificar líneas de conteo."
          : getErrorMessage(error);

      setEditingQuantity((current) =>
        current ? { ...current, isSubmitting: false, error: message } : current,
      );
    }
  }

  function handleQuantityEditKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSaveQuantity();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditQuantity();
    }
  }

  async function handleApprove(): Promise<void> {
    if (!token || loadState.status !== "success") {
      return;
    }

    if (
      !globalThis.confirm(
        "¿Aprobar este conteo? Se generarán los movimientos de ajuste correspondientes por cada diferencia y el conteo ya no podrá editarse.",
      )
    ) {
      return;
    }

    setApproveState({ isSubmitting: true, error: null });

    try {
      const updated = await approveInventoryCount(token, loadState.inventoryCount.id);

      setLoadState({ status: "success", inventoryCount: updated, message: null });
      setApproveState({ isSubmitting: false, error: null });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para aprobar conteos."
          : getErrorMessage(error);

      setApproveState({ isSubmitting: false, error: message });
    }
  }

  async function handleCancel(): Promise<void> {
    if (!token || loadState.status !== "success") {
      return;
    }

    if (
      !globalThis.confirm(
        "¿Anular este conteo en borrador? Esta acción no se puede deshacer.",
      )
    ) {
      return;
    }

    setCancelState({ isSubmitting: true, error: null });

    try {
      const updated = await cancelInventoryCount(token, loadState.inventoryCount.id);

      setLoadState({ status: "success", inventoryCount: updated, message: null });
      setCancelState({ isSubmitting: false, error: null });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para anular conteos."
          : getErrorMessage(error);

      setCancelState({ isSubmitting: false, error: message });
    }
  }

  async function handleDeleteCount(): Promise<void> {
    if (!token || loadState.status !== "success") {
      return;
    }

    if (
      !globalThis.confirm(
        "¿Eliminar este conteo en borrador? Esta acción no se puede deshacer y se perderán todas sus líneas.",
      )
    ) {
      return;
    }

    setDeleteCountState({ isSubmitting: true, error: null });

    try {
      await deleteInventoryCount(token, loadState.inventoryCount.id);

      router.replace("/inventory/counts");
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para eliminar conteos."
          : getErrorMessage(error);

      setDeleteCountState({ isSubmitting: false, error: message });
    }
  }

  if (!Number.isInteger(inventoryCountId) || inventoryCountId <= 0) {
    return (
      <AppShell
        title="Conteo no válido"
        description="La dirección proporcionada no identifica un conteo."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un conteo válido."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/inventory/counts");
              }}
            >
              Volver a conteos
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
        description="Este módulo requiere permisos de conteos físicos."
      >
        <StatePanel
          title="No tiene acceso al conteo"
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
        loadState.status === "success" ? loadState.inventoryCount.reference : "Detalle de conteo"
      }
      description={
        loadState.status === "success"
          ? `Conteo físico del ${loadState.inventoryCount.count_date}`
          : "Información registrada del conteo."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {loadState.status === "success" &&
            loadState.inventoryCount.status === "DRAFT" &&
            hasWriteAccess && (
              <Button
                type="button"
                isLoading={approveState.isSubmitting}
                loadingText="Aprobando…"
                disabled={itemsState.status !== "success" || itemsState.items.length === 0}
                title={
                  itemsState.status === "success" && itemsState.items.length === 0
                    ? "Agregue al menos una línea antes de aprobar."
                    : undefined
                }
                onClick={() => {
                  void handleApprove();
                }}
              >
                Aprobar conteo
              </Button>
            )}

          {loadState.status === "success" &&
            loadState.inventoryCount.status === "DRAFT" &&
            hasWriteAccess && (
              <Button
                type="button"
                variant="secondary"
                isLoading={cancelState.isSubmitting}
                loadingText="Anulando…"
                onClick={() => {
                  void handleCancel();
                }}
              >
                Anular conteo
              </Button>
            )}

          {loadState.status === "success" &&
            loadState.inventoryCount.status === "DRAFT" &&
            hasWriteAccess && (
              <Button
                type="button"
                variant="danger"
                isLoading={deleteCountState.isSubmitting}
                loadingText="Eliminando…"
                onClick={() => {
                  void handleDeleteCount();
                }}
              >
                Eliminar conteo
              </Button>
            )}

          <Button type="button" variant="secondary" onClick={goBack}>
            <ArrowLeftIcon />
            Volver
          </Button>
        </div>
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando conteo…" />}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Conteo no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/inventory/counts");
              }}
            >
              Volver al listado
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el conteo"
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
          {approveState.error && <FormError message={approveState.error} />}
          {cancelState.error && <FormError message={cancelState.error} />}
          {deleteCountState.error && <FormError message={deleteCountState.error} />}

          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-foreground">
                  {loadState.inventoryCount.reference}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {loadState.inventoryCount.notes || "Sin notas registradas."}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <span
                  className={[
                    "inline-flex w-fit items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                    STATUS_BADGE_CLASSES[loadState.inventoryCount.status],
                  ].join(" ")}
                >
                  {STATUS_LABELS[loadState.inventoryCount.status]}
                </span>

                <span
                  className={[
                    "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                    loadState.inventoryCount.is_active
                      ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                      : "bg-surface-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {loadState.inventoryCount.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Fecha del conteo</dt>
                <dd>{loadState.inventoryCount.count_date}</dd>
              </div>

              <div className="app-status-row">
                <dt>Fecha de creación</dt>
                <dd>{formatDate(loadState.inventoryCount.created_at)}</dd>
              </div>

              <div className="app-status-row">
                <dt>Última modificación</dt>
                <dd>{formatDate(loadState.inventoryCount.updated_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[var(--color-border-soft)] p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  Líneas del conteo
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Productos contados físicamente y su diferencia contra el sistema.
                </p>
              </div>
            </div>

            {!canManageItems && loadState.inventoryCount.status !== "DRAFT" && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-4">
                <p className="text-sm text-muted-foreground">
                  Las líneas de un conteo{" "}
                  {loadState.inventoryCount.status === "APPROVED" ? "aprobado" : "anulado"} no
                  pueden modificarse.
                </p>
              </div>
            )}

            {canManageItems && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-6">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-foreground">Captura rápida</h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Busque por código o nombre y presione Enter para seleccionar. Ingrese la
                    cantidad y presione Enter para agregar la línea y continuar con el siguiente
                    producto.
                  </p>
                </div>

                {captureState.submitError && (
                  <div className="mb-4">
                    <FormError message={captureState.submitError} />
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
                  <div>
                    <label
                      htmlFor="count-capture-product"
                      className="mb-2 block text-sm font-semibold text-foreground"
                    >
                      Producto
                    </label>

                    {captureState.selectedProduct ? (
                      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-2.5">
                        <div>
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {captureState.selectedProduct.standard_code}
                          </span>

                          <span className="ml-2 text-sm text-muted-foreground">
                            {captureState.selectedProduct.name}
                          </span>

                          <span className="ml-2 text-xs text-[var(--color-text-subtle)]">
                            Stock actual: {captureState.selectedProduct.current_stock}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={clearSelectedProduct}
                          className="text-xs font-semibold text-primary hover:underline"
                          disabled={captureState.isSubmitting}
                        >
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          id="count-capture-product"
                          ref={searchInputRef}
                          value={captureState.query}
                          onChange={(event) => {
                            const nextValue = event.target.value;

                            setCaptureState((current) => ({
                              ...current,
                              query: nextValue,
                              isListOpen: true,
                              results: nextValue.trim().length < 2 ? [] : current.results,
                              searchError:
                                nextValue.trim().length < 2 ? null : current.searchError,
                            }));
                          }}
                          onFocus={() => {
                            setCaptureState((current) => ({ ...current, isListOpen: true }));
                          }}
                          onBlur={() => {
                            globalThis.setTimeout(() => {
                              setCaptureState((current) => ({ ...current, isListOpen: false }));
                            }, 150);
                          }}
                          onKeyDown={handleSearchKeyDown}
                          hasError={Boolean(captureState.fieldErrors.productId)}
                          placeholder="Código o nombre del producto"
                          autoComplete="off"
                          disabled={captureState.isSubmitting}
                        />

                        {captureState.isListOpen && captureState.query.trim().length >= 2 && (
                          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                            {captureState.searchError && (
                              <p className="px-4 py-3 text-sm text-[var(--color-danger)]">
                                {captureState.searchError}
                              </p>
                            )}

                            {!captureState.searchError && captureState.results.length === 0 && (
                              <p className="px-4 py-3 text-sm text-muted-foreground">
                                Sin resultados.
                              </p>
                            )}

                            {!captureState.searchError && captureState.results.length > 0 && (
                              <ul className="max-h-64 overflow-y-auto">
                                {captureState.results.map((product) => (
                                  <li key={product.id}>
                                    <button
                                      type="button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        selectProduct(product);
                                      }}
                                      className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                                    >
                                      <span className="font-mono font-semibold text-foreground">
                                        {product.standard_code}
                                      </span>

                                      <span className="ml-2 text-muted-foreground">
                                        {product.name}
                                      </span>

                                      <span className="ml-2 text-xs text-[var(--color-text-subtle)]">
                                        Stock actual: {product.current_stock}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {captureState.fieldErrors.productId && (
                      <p className="mt-2 text-sm font-medium text-danger" role="alert">
                        {captureState.fieldErrors.productId}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="count-capture-quantity"
                      className="mb-2 block text-sm font-semibold text-foreground"
                    >
                      Cantidad contada
                    </label>

                    <Input
                      id="count-capture-quantity"
                      ref={quantityInputRef}
                      value={captureState.quantity}
                      onChange={(event) => {
                        const nextValue = event.target.value;

                        setCaptureState((current) => {
                          const nextFieldErrors = { ...current.fieldErrors };

                          delete nextFieldErrors.countedQuantity;

                          return { ...current, quantity: nextValue, fieldErrors: nextFieldErrors };
                        });
                      }}
                      onKeyDown={handleQuantityKeyDown}
                      hasError={Boolean(captureState.fieldErrors.countedQuantity)}
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={!captureState.selectedProduct || captureState.isSubmitting}
                    />

                    {captureState.fieldErrors.countedQuantity && (
                      <p className="mt-2 text-sm font-medium text-danger" role="alert">
                        {captureState.fieldErrors.countedQuantity}
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    isLoading={captureState.isSubmitting}
                    loadingText="Agregando…"
                    disabled={!captureState.selectedProduct}
                    onClick={() => {
                      void handleAddItem();
                    }}
                  >
                    Agregar línea
                  </Button>
                </div>
              </div>
            )}

            {itemsActionError && (
              <div className="border-b border-[var(--color-border-soft)] p-6">
                <FormError message={itemsActionError} />
              </div>
            )}

            {itemsState.status === "loading" && (
              <LoadingState message="Consultando líneas…" />
            )}

            {itemsState.status === "error" && (
              <div className="p-6">
                <StatePanel
                  title="No se pudieron cargar las líneas"
                  message={itemsState.message}
                  tone="error"
                />
              </div>
            )}

            {itemsState.status === "success" && itemsState.items.length === 0 && (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Este conteo todavía no tiene líneas registradas.
                </p>
              </div>
            )}

            {itemsState.status === "success" && itemsState.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Producto
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Cantidad contada
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Stock actual
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Diferencia
                      </th>

                      {canManageItems && (
                        <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Acciones
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {itemsState.items.map((item) => {
                      const difference = item.counted_quantity - item.product_detail.current_stock;

                      const rowEditing =
                        editingQuantity && editingQuantity.itemId === item.id
                          ? editingQuantity
                          : null;

                      return (
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

                          <td className="px-5 py-4 text-sm text-foreground">
                            {rowEditing ? (
                              <div>
                                <Input
                                  value={rowEditing.value}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;

                                    setEditingQuantity((current) =>
                                      current
                                        ? { ...current, value: nextValue, error: null }
                                        : current,
                                    );
                                  }}
                                  onKeyDown={handleQuantityEditKeyDown}
                                  hasError={Boolean(rowEditing.error)}
                                  inputMode="numeric"
                                  autoComplete="off"
                                  autoFocus
                                  disabled={rowEditing.isSubmitting}
                                  className="h-10 w-28"
                                />

                                {rowEditing.error && (
                                  <p className="mt-1 text-xs font-medium text-danger">
                                    {rowEditing.error}
                                  </p>
                                )}
                              </div>
                            ) : (
                              item.counted_quantity
                            )}
                          </td>

                          <td className="px-5 py-4 text-sm text-foreground">
                            {item.product_detail.current_stock}
                          </td>

                          <td className={`px-5 py-4 text-sm ${differenceClassName(difference)}`}>
                            {difference === 0 ? "Sin diferencia" : formatDifference(difference)}
                          </td>

                          {canManageItems && (
                            <td className="px-5 py-4">
                              <div className="flex justify-end gap-2">
                                {rowEditing ? (
                                  <>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={cancelEditQuantity}
                                      disabled={rowEditing.isSubmitting}
                                    >
                                      Cancelar
                                    </Button>

                                    <Button
                                      type="button"
                                      isLoading={rowEditing.isSubmitting}
                                      loadingText="Guardando…"
                                      onClick={() => {
                                        void handleSaveQuantity();
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
                                        startEditQuantity(item);
                                      }}
                                      disabled={pendingDeleteItemId !== null}
                                    >
                                      Editar
                                    </Button>

                                    <Button
                                      type="button"
                                      variant="danger"
                                      isLoading={pendingDeleteItemId === item.id}
                                      loadingText="Eliminando…"
                                      onClick={() => {
                                        void handleDeleteItem(item);
                                      }}
                                      disabled={
                                        pendingDeleteItemId !== null &&
                                        pendingDeleteItemId !== item.id
                                      }
                                    >
                                      Eliminar
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
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
