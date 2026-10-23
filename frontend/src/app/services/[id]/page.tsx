"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/form-error";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AmountsSummary } from "@/components/documents/amounts-summary";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { canCancelServices, canPriceServices, canReadProducts, canReadServices, canWriteServices } from "@/features/auth/permissions";
import { formatDate, formatMoney } from "@/features/inventory/purchases/format";
import {
  cancelServiceRecord,
  createServiceAccessory,
  deleteServiceAccessory,
  deliverServiceRecord,
  getServiceAccessories,
  getServiceChargeLines,
  getServiceInvoicePdf,
  getServiceRecord,
  markServiceRecordReady,
  startServiceRecord,
  updateServiceAccessory,
  updateServiceRecordPrice,
  updateServiceRecordTechnicalData,
} from "@/features/services/api";
import {
  mapServiceAccessoryApiFieldErrors,
  mapServicePriceApiFieldErrors,
  mapServiceRecordTechnicalApiFieldErrors,
} from "@/features/services/form-errors";
import { ServiceAccessoryForm } from "@/features/services/service-accessory-form";
import { ServiceChargesSection } from "@/features/services/service-charges-section";
import { ServiceKitPicker } from "@/features/services/service-kit-picker";
import { ServicePriceForm } from "@/features/services/service-price-form";
import { ServiceTechnicalForm } from "@/features/services/service-technical-form";
import {
  buildServiceAccessoryWritePayload,
  buildServicePriceWritePayload,
  buildServiceRecordTechnicalWritePayload,
  EMPTY_SERVICE_ACCESSORY_FORM_VALUES,
  PAYMENT_METHOD_LABELS,
  serviceRecordToPriceFormValues,
  serviceRecordToTechnicalFormValues,
  type ServiceAccessory,
  type ServiceAccessoryFormErrors,
  type ServiceAccessoryFormValues,
  type ServiceChargeLine,
  type ServicePriceFormErrors,
  type ServicePriceFormValues,
  type ServiceRecord,
  type ServiceRecordTechnicalFormErrors,
  type ServiceRecordTechnicalFormValues,
  type ServiceStatus,
} from "@/features/services/types";
import { useRecordRecentlyViewed } from "@/features/recently-viewed/use-record-recently-viewed";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";

type LoadState =
  | {
      status: "loading";
      serviceRecord: null;
      accessories: [];
      lines: [];
      message: null;
    }
  | {
      status: "success";
      serviceRecord: ServiceRecord;
      accessories: ServiceAccessory[];
      // Líneas de cobro (punto 3 + 1B del plan del 2026-10-22). Vacías para
      // quien no es Administrador: no las puede ver.
      lines: ServiceChargeLine[];
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      serviceRecord: null;
      accessories: [];
      lines: [];
      message: string;
    };

type AccessoryFormState = "closed" | "create" | "kit";

type AccessoryEditDraft = {
  quantity: string;
  unitPrice: string;
  notes: string;
};

type AccessoryActionState = {
  isSubmitting: boolean;
  submitError: string | null;
  fieldErrors: ServiceAccessoryFormErrors;
  pendingDeleteId: number | null;
};

type TransitionAction = "start" | "mark-ready" | "deliver" | "cancel";

type TransitionState = {
  pendingAction: TransitionAction | null;
  error: string | null;
};

const STATUS_LABELS: Record<ServiceStatus, string> = {
  RECEIVED: "Recibido",
  IN_PROGRESS: "En proceso",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Anulado",
};

const STATUS_BADGE_CLASSES: Record<ServiceStatus, string> = {
  RECEIVED: "bg-surface-muted text-muted-foreground",
  IN_PROGRESS: "bg-[var(--color-primary-soft)] text-[var(--color-brand-blue)]",
  READY: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  DELIVERED: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
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

  return "No fue posible consultar el servicio.";
}

function formatAccessoryLabel(serviceAccessory: ServiceAccessory): string {
  return `${serviceAccessory.product_detail.standard_code} — ${serviceAccessory.product_detail.name}`;
}

export default function ServiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    serviceRecord: null,
    accessories: [],
    lines: [],
    message: null,
  });

  const [technicalState, setTechnicalState] = useState<{
    isSubmitting: boolean;
    submitError: string | null;
    fieldErrors: ServiceRecordTechnicalFormErrors;
  }>({
    isSubmitting: false,
    submitError: null,
    fieldErrors: {},
  });

  const [priceState, setPriceState] = useState<{
    isSubmitting: boolean;
    submitError: string | null;
    fieldErrors: ServicePriceFormErrors;
  }>({
    isSubmitting: false,
    submitError: null,
    fieldErrors: {},
  });

  const [transitionState, setTransitionState] = useState<TransitionState>({
    pendingAction: null,
    error: null,
  });

  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);

  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [accessoryFormState, setAccessoryFormState] = useState<AccessoryFormState>("closed");

  const [accessoryActionState, setAccessoryActionState] = useState<AccessoryActionState>({
    isSubmitting: false,
    submitError: null,
    fieldErrors: {},
    pendingDeleteId: null,
  });

  const [editingAccessoryId, setEditingAccessoryId] = useState<number | null>(null);

  const [accessoryEditDraft, setAccessoryEditDraft] = useState<AccessoryEditDraft>({
    quantity: "",
    unitPrice: "",
    notes: "",
  });

  const [isSavingAccessoryEdit, setIsSavingAccessoryEdit] = useState(false);

  const serviceRecordId = Number(params.id);

  const hasCustomersAccess = user ? canReadServices(user) : false;

  const hasWriteAccess = user ? canWriteServices(user) : false;

  const hasProductsAccess = user ? canReadProducts(user) : false;

  const hasCancelAccess = user ? canCancelServices(user) : false;

  // Precio, entrega y factura: solo el Administrador (punto 25).
  const hasPricingAccess = user ? canPriceServices(user) : false;

  const canManage =
    loadState.status === "success" &&
    loadState.serviceRecord.status !== "DELIVERED" &&
    loadState.serviceRecord.status !== "CANCELLED" &&
    hasWriteAccess;

  useRecordRecentlyViewed(
    loadState.status === "success"
      ? {
          type: "service",
          id: loadState.serviceRecord.id,
          label: `${loadState.serviceRecord.injector_detail.injector_number} · ${loadState.serviceRecord.injector_detail.customer_detail.display_name}`,
          href: `/services/${loadState.serviceRecord.id}`,
        }
      : null,
  );

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasCustomersAccess ||
      !Number.isInteger(serviceRecordId) ||
      serviceRecordId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    Promise.all([
      getServiceRecord(token, serviceRecordId, controller.signal),
      getServiceAccessories(token, serviceRecordId, controller.signal),
      hasPricingAccess
        ? getServiceChargeLines(token, serviceRecordId, controller.signal)
        : Promise.resolve<ServiceChargeLine[]>([]),
    ])
      .then(([serviceRecord, accessories, lines]) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", serviceRecord, accessories, lines, message: null });
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
            serviceRecord: null,
            accessories: [],
            lines: [],
            message: "Este usuario no tiene permisos para consultar servicios.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            serviceRecord: null,
            accessories: [],
            lines: [],
            message: "El servicio solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          serviceRecord: null,
          accessories: [],
          lines: [],
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasCustomersAccess, hasPricingAccess, logout, router, serviceRecordId, token]);

  function handleUnauthorized(): void {
    void logout().then(() => {
      router.replace("/login");
    });
  }

  // Después de cualquier cambio de líneas o accesorios: el precio lo
  // recalcula el backend, así que se vuelve a pedir todo junto.
  async function reloadServiceData(): Promise<void> {
    if (!token) {
      return;
    }

    try {
      const [serviceRecord, accessories, lines] = await Promise.all([
        getServiceRecord(token, serviceRecordId),
        getServiceAccessories(token, serviceRecordId),
        hasPricingAccess
          ? getServiceChargeLines(token, serviceRecordId)
          : Promise.resolve<ServiceChargeLine[]>([]),
      ]);

      setLoadState({ status: "success", serviceRecord, accessories, lines, message: null });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }

      setAccessoryActionState((current) => ({
        ...current,
        submitError: getErrorMessage(error),
      }));
    }
  }

  function goBack(): void {
    router.back();
  }

  async function handleTechnicalSubmit(
    values: ServiceRecordTechnicalFormValues,
  ): Promise<void> {
    if (!token || loadState.status !== "success") {
      return;
    }

    setTechnicalState({ isSubmitting: true, submitError: null, fieldErrors: {} });

    try {
      const updated = await updateServiceRecordTechnicalData(
        token,
        loadState.serviceRecord.id,
        buildServiceRecordTechnicalWritePayload(values),
      );

      setLoadState((current) => {
        if (current.status !== "success") {
          return current;
        }

        return { ...current, serviceRecord: updated };
      });

      setTechnicalState({ isSubmitting: false, submitError: null, fieldErrors: {} });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setTechnicalState({
          isSubmitting: false,
          submitError: "Este usuario no tiene permisos para editar datos técnicos.",
          fieldErrors: {},
        });

        return;
      }

      if (error instanceof ApiError) {
        const fieldErrors = mapServiceRecordTechnicalApiFieldErrors(error.fieldErrors);

        setTechnicalState({
          isSubmitting: false,
          submitError: Object.keys(fieldErrors).length > 0 ? null : error.message,
          fieldErrors,
        });

        return;
      }

      setTechnicalState({
        isSubmitting: false,
        submitError: getErrorMessage(error),
        fieldErrors: {},
      });
    }
  }

  async function handlePriceSubmit(
    values: ServicePriceFormValues,
  ): Promise<void> {
    if (!token || loadState.status !== "success") {
      return;
    }

    setPriceState({ isSubmitting: true, submitError: null, fieldErrors: {} });

    try {
      const updated = await updateServiceRecordPrice(
        token,
        loadState.serviceRecord.id,
        buildServicePriceWritePayload(values),
      );

      setLoadState((current) => {
        if (current.status !== "success") {
          return current;
        }

        return { ...current, serviceRecord: updated };
      });

      setPriceState({ isSubmitting: false, submitError: null, fieldErrors: {} });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setPriceState({
          isSubmitting: false,
          submitError: "Este usuario no tiene permisos para editar el precio.",
          fieldErrors: {},
        });

        return;
      }

      if (error instanceof ApiError) {
        const fieldErrors = mapServicePriceApiFieldErrors(error.fieldErrors);

        setPriceState({
          isSubmitting: false,
          submitError: Object.keys(fieldErrors).length > 0 ? null : error.message,
          fieldErrors,
        });

        return;
      }

      setPriceState({
        isSubmitting: false,
        submitError: getErrorMessage(error),
        fieldErrors: {},
      });
    }
  }

  async function runTransition(
    action: TransitionAction,
    confirmMessage: string | null,
    apiCall: (token: string, id: number) => Promise<ServiceRecord>,
  ): Promise<void> {
    if (!token || loadState.status !== "success") {
      return;
    }

    if (confirmMessage && !confirmWithFocusRestore(confirmMessage)) {
      return;
    }

    setTransitionState({ pendingAction: action, error: null });

    try {
      const updated = await apiCall(token, loadState.serviceRecord.id);

      setLoadState((current) => {
        if (current.status !== "success") {
          return current;
        }

        return { ...current, serviceRecord: updated };
      });

      setTransitionState({ pendingAction: null, error: null });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para modificar el estado del servicio."
          : getErrorMessage(error);

      setTransitionState({ pendingAction: null, error: message });
    }
  }

  async function handleDownloadInvoice(): Promise<void> {
    if (!token || loadState.status !== "success") {
      return;
    }

    setIsDownloadingInvoice(true);
    setInvoiceError(null);

    try {
      const blob = await getServiceInvoicePdf(token, loadState.serviceRecord.id);

      const downloadUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = downloadUrl;
      anchor.download = `factura-servicio-${loadState.serviceRecord.id}.pdf`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      globalThis.setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 1_000);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para descargar la factura."
          : getErrorMessage(error);

      setInvoiceError(message);
    } finally {
      setIsDownloadingInvoice(false);
    }
  }

  function openCreateAccessoryForm(): void {
    setAccessoryActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingDeleteId: null,
    });

    setAccessoryFormState("create");
  }

  function closeAccessoryForm(): void {
    if (accessoryActionState.isSubmitting) {
      return;
    }

    setAccessoryFormState("closed");

    setAccessoryActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingDeleteId: null,
    });
  }

  async function handleAccessorySubmit(values: ServiceAccessoryFormValues): Promise<void> {
    if (!token || loadState.status !== "success" || accessoryFormState !== "create") {
      return;
    }

    setAccessoryActionState((current) => ({
      ...current,
      isSubmitting: true,
      submitError: null,
      fieldErrors: {},
    }));

    try {
      await createServiceAccessory(
        token,
        buildServiceAccessoryWritePayload(loadState.serviceRecord.id, values),
      );

      await reloadServiceData();

      setAccessoryFormState("closed");

      setAccessoryActionState({
        isSubmitting: false,
        submitError: null,
        fieldErrors: {},
        pendingDeleteId: null,
      });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setAccessoryActionState((current) => ({
          ...current,
          isSubmitting: false,
          submitError: "Este usuario no tiene permisos para modificar accesorios.",
        }));

        return;
      }

      if (error instanceof ApiError) {
        const fieldErrors = mapServiceAccessoryApiFieldErrors(error.fieldErrors);

        setAccessoryActionState((current) => ({
          ...current,
          isSubmitting: false,
          submitError: Object.keys(fieldErrors).length > 0 ? null : error.message,
          fieldErrors,
        }));

        return;
      }

      setAccessoryActionState((current) => ({
        ...current,
        isSubmitting: false,
        submitError: getErrorMessage(error),
      }));
    }
  }

  async function handleDeleteAccessory(accessory: ServiceAccessory): Promise<void> {
    if (!token) {
      return;
    }

    if (
      !confirmWithFocusRestore(
        `¿Quitar el accesorio ${formatAccessoryLabel(accessory)}? Vuelve al inventario.`,
      )
    ) {
      return;
    }

    setAccessoryActionState((current) => ({
      ...current,
      submitError: null,
      fieldErrors: {},
      pendingDeleteId: accessory.id,
    }));

    try {
      await deleteServiceAccessory(token, accessory.id);

      await reloadServiceData();

      setAccessoryActionState((current) => ({ ...current, pendingDeleteId: null }));
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para eliminar accesorios."
          : getErrorMessage(error);

      setAccessoryActionState((current) => ({
        ...current,
        submitError: message,
        pendingDeleteId: null,
      }));
    }
  }

  function startEditingAccessory(accessory: ServiceAccessory): void {
    setEditingAccessoryId(accessory.id);
    setAccessoryEditDraft({
      quantity: String(accessory.quantity),
      unitPrice: accessory.unit_price !== null ? String(Number(accessory.unit_price)) : "",
      notes: accessory.notes,
    });
    setAccessoryActionState((current) => ({ ...current, submitError: null }));
  }

  // Cambiar la cantidad ajusta el inventario: el backend devuelve lo que
  // tenía el accesorio y descuenta la cantidad nueva.
  async function handleSaveAccessoryEdit(accessory: ServiceAccessory): Promise<void> {
    if (!token) {
      return;
    }

    const quantity = accessoryEditDraft.quantity.trim();
    const unitPrice = accessoryEditDraft.unitPrice.trim();

    if (!/^\d+$/.test(quantity) || Number(quantity) < 1) {
      setAccessoryActionState((current) => ({
        ...current,
        submitError: "La cantidad debe ser un número entero de 1 o más.",
      }));
      return;
    }

    if (hasPricingAccess && !/^\d+(\.\d+)?$/.test(unitPrice)) {
      setAccessoryActionState((current) => ({
        ...current,
        submitError: "Ingrese el precio del accesorio (0 o más).",
      }));
      return;
    }

    setIsSavingAccessoryEdit(true);
    setAccessoryActionState((current) => ({ ...current, submitError: null }));

    try {
      await updateServiceAccessory(token, accessory.id, {
        quantity: Number(quantity),
        notes: accessoryEditDraft.notes.trim(),
        ...(hasPricingAccess ? { unit_price: unitPrice } : {}),
      });

      setEditingAccessoryId(null);
      await reloadServiceData();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }

      setAccessoryActionState((current) => ({
        ...current,
        submitError: getErrorMessage(error),
      }));
    } finally {
      setIsSavingAccessoryEdit(false);
    }
  }

  if (!Number.isInteger(serviceRecordId) || serviceRecordId <= 0) {
    return (
      <AppShell
        title="Servicio no válido"
        description="La dirección proporcionada no identifica un servicio."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un servicio válido."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/services");
              }}
            >
              Volver a servicios
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (authStatus === "authenticated" && user && !hasCustomersAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de servicios."
      >
        <StatePanel
          title="No tiene acceso al servicio"
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
          ? loadState.serviceRecord.injector_detail.injector_number
          : "Detalle de servicio"
      }
      description={
        loadState.status === "success"
          ? loadState.serviceRecord.injector_detail.customer_detail.display_name
          : "Información registrada del servicio."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {loadState.status === "success" &&
            loadState.serviceRecord.status === "DELIVERED" &&
            hasPricingAccess && (
            <Button
              type="button"
              variant="secondary"
              isLoading={isDownloadingInvoice}
              loadingText="Generando…"
              onClick={() => {
                void handleDownloadInvoice();
              }}
            >
              Descargar factura
            </Button>
          )}

          {loadState.status === "success" &&
            (loadState.serviceRecord.status === "RECEIVED" ||
              loadState.serviceRecord.status === "IN_PROGRESS" ||
              loadState.serviceRecord.status === "READY") &&
            hasCancelAccess && (
              <Button
                type="button"
                variant="danger"
                isLoading={transitionState.pendingAction === "cancel"}
                loadingText="Anulando…"
                onClick={() => {
                  void runTransition(
                    "cancel",
                    "¿Anular este servicio? Esta acción no se puede deshacer.",
                    cancelServiceRecord,
                  );
                }}
              >
                Anular
              </Button>
            )}

          <Button type="button" variant="secondary" onClick={goBack}>
            <ArrowLeftIcon />
            Volver
          </Button>
        </div>
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando servicio…" />}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Servicio no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/services");
              }}
            >
              Volver al listado
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el servicio"
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
          {transitionState.error && <FormError message={transitionState.error} />}

          {invoiceError && <FormError message={invoiceError} />}

          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-foreground">
                  {loadState.serviceRecord.injector_detail.injector_number}
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Cliente:{" "}
                  <Link
                    href={`/customers/${loadState.serviceRecord.injector_detail.customer}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {loadState.serviceRecord.injector_detail.customer_detail.display_name}
                  </Link>
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  <Link
                    href={`/injectors/${loadState.serviceRecord.injector}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    Ver inyector
                  </Link>
                </p>
              </div>

              <span
                className={[
                  "inline-flex w-fit items-center rounded-full px-3 py-1.5 text-xs font-semibold",
                  STATUS_BADGE_CLASSES[loadState.serviceRecord.status],
                ].join(" ")}
              >
                {STATUS_LABELS[loadState.serviceRecord.status]}
              </span>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Recibido</dt>
                <dd>{formatDate(loadState.serviceRecord.received_at)}</dd>
              </div>

              {loadState.serviceRecord.delivered_at && (
                <div className="app-status-row">
                  <dt>Entregado</dt>
                  <dd>{formatDate(loadState.serviceRecord.delivered_at)}</dd>
                </div>
              )}

              <div className="app-status-row">
                <dt>Última modificación</dt>
                <dd>{formatDate(loadState.serviceRecord.updated_at)}</dd>
              </div>
            </dl>
          </section>

          {hasPricingAccess && (
            <section className="app-status-card overflow-hidden">
              <div className="border-b border-[var(--color-border-soft)] p-6">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  Cobro del servicio
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {canManage
                    ? "Lo que se cobra: líneas de cobro (mano de obra y otros conceptos) más los accesorios usados, cada uno con su precio. El total se calcula solo."
                    : loadState.serviceRecord.status === "DELIVERED"
                      ? "Montos tal como quedaron al entregar el servicio."
                      : "Este servicio ya no admite modificaciones."}
                </p>
              </div>

              <div className="grid gap-6 p-6">
                <ServiceChargesSection
                  token={token ?? ""}
                  serviceRecordId={loadState.serviceRecord.id}
                  lines={loadState.lines}
                  accessories={loadState.accessories}
                  subtotal={
                    loadState.serviceRecord.price !== null
                      ? Number(loadState.serviceRecord.price)
                      : null
                  }
                  canManage={canManage}
                  onChanged={reloadServiceData}
                  onUnauthorized={handleUnauthorized}
                />

                <div className="border-t border-[var(--color-border-soft)] pt-6">
                  {canManage ? (
                    <ServicePriceForm
                      key={loadState.serviceRecord.id}
                      initialValues={serviceRecordToPriceFormValues(loadState.serviceRecord)}
                      subtotal={
                        loadState.serviceRecord.price !== null
                          ? Number(loadState.serviceRecord.price)
                          : null
                      }
                      isSubmitting={priceState.isSubmitting}
                      submitError={priceState.submitError}
                      serverErrors={priceState.fieldErrors}
                      onSubmit={handlePriceSubmit}
                    />
                  ) : (
                    <div className="grid gap-5">
                      <div className="max-w-md">
                        <AmountsSummary
                          amounts={
                            loadState.serviceRecord.total !== null
                              ? {
                                  subtotal: Number(loadState.serviceRecord.subtotal),
                                  discountAmount: Number(
                                    loadState.serviceRecord.discount_amount,
                                  ),
                                  taxAmount: Number(loadState.serviceRecord.tax_amount),
                                  total: Number(loadState.serviceRecord.total),
                                }
                              : null
                          }
                          fallbackSubtotal={
                            loadState.serviceRecord.price !== null
                              ? Number(loadState.serviceRecord.price)
                              : null
                          }
                          discountType={loadState.serviceRecord.discount_type ?? "AMOUNT"}
                          discountValue={loadState.serviceRecord.discount_value ?? "0"}
                          taxPercentage={loadState.serviceRecord.tax_percentage ?? "0"}
                          showZeroRows={false}
                          subtotalLabel="Subtotal (líneas y accesorios)"
                        />
                      </div>

                      <dl>
                        <div className="app-status-row">
                          <dt>Método de pago</dt>
                          <dd>
                            {loadState.serviceRecord.payment_method
                              ? PAYMENT_METHOD_LABELS[loadState.serviceRecord.payment_method]
                              : "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="app-status-card overflow-hidden">
            <div className="border-b border-[var(--color-border-soft)] p-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Datos técnicos
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {canManage
                  ? "Mediciones y observaciones del servicio."
                  : "Este servicio ya no admite modificaciones."}
              </p>
            </div>

            <div className="p-6">
              {canManage ? (
                <ServiceTechnicalForm
                  key={loadState.serviceRecord.id}
                  initialValues={serviceRecordToTechnicalFormValues(loadState.serviceRecord)}
                  isSubmitting={technicalState.isSubmitting}
                  submitError={technicalState.submitError}
                  serverErrors={technicalState.fieldErrors}
                  onSubmit={handleTechnicalSubmit}
                />
              ) : (
                <dl>
                  <div className="app-status-row">
                    <dt>Resistencia</dt>
                    <dd>{loadState.serviceRecord.resistance ?? "—"}</dd>
                  </div>

                  <div className="app-status-row">
                    <dt>Fuga</dt>
                    <dd>{loadState.serviceRecord.leakage ?? "—"}</dd>
                  </div>

                  <div className="app-status-row">
                    <dt>Inductancia</dt>
                    <dd>{loadState.serviceRecord.inductance ?? "—"}</dd>
                  </div>

                  <div className="app-status-row">
                    <dt>Aislamiento</dt>
                    <dd>{loadState.serviceRecord.isolation ?? "—"}</dd>
                  </div>

                  <div className="app-status-row">
                    <dt>Notas antes</dt>
                    <dd>{loadState.serviceRecord.notes_before || "—"}</dd>
                  </div>

                  <div className="app-status-row">
                    <dt>Notas después</dt>
                    <dd>{loadState.serviceRecord.notes_after || "—"}</dd>
                  </div>

                  <div className="app-status-row">
                    <dt>Observaciones</dt>
                    <dd>{loadState.serviceRecord.observations || "—"}</dd>
                  </div>
                </dl>
              )}
            </div>
          </section>

          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[var(--color-border-soft)] p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  Accesorios utilizados
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Piezas del inventario usadas durante el servicio. Agregarlas descuenta el stock;
                  cambiar la cantidad lo ajusta y quitarlas lo devuelve.
                </p>
              </div>

              {canManage && accessoryFormState === "closed" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingAccessoryId(null);
                      setAccessoryFormState("kit");
                    }}
                  >
                    Agregar kit
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      setEditingAccessoryId(null);
                      openCreateAccessoryForm();
                    }}
                  >
                    Agregar accesorio
                  </Button>
                </div>
              )}
            </div>

            {accessoryActionState.submitError && accessoryFormState === "closed" && (
              <div className="border-b border-[var(--color-border-soft)] p-6">
                <FormError message={accessoryActionState.submitError} />
              </div>
            )}

            {accessoryFormState === "kit" && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-6">
                <ServiceKitPicker
                  token={token ?? ""}
                  serviceRecordId={loadState.serviceRecord.id}
                  onApplied={reloadServiceData}
                  onClose={() => {
                    setAccessoryFormState("closed");
                  }}
                  onUnauthorized={handleUnauthorized}
                />
              </div>
            )}

            {accessoryFormState === "create" && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-6">
                <div className="mb-5">
                  <h3 className="text-base font-semibold text-foreground">Agregar accesorio</h3>
                </div>

                <ServiceAccessoryForm
                  canReadProducts={hasProductsAccess}
                  initialValues={EMPTY_SERVICE_ACCESSORY_FORM_VALUES}
                  token={token ?? ""}
                  isSubmitting={accessoryActionState.isSubmitting}
                  submitError={accessoryActionState.submitError}
                  serverErrors={accessoryActionState.fieldErrors}
                  onSubmit={handleAccessorySubmit}
                  onCancel={closeAccessoryForm}
                />
              </div>
            )}

            {loadState.accessories.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Este servicio todavía no tiene accesorios registrados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Producto</th>
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Cantidad</th>
                      {hasPricingAccess && <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Precio</th>}
                      {hasPricingAccess && <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Importe</th>}
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Notas</th>
                      {canManage && <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Acciones</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {loadState.accessories.map((accessory) =>
                      editingAccessoryId === accessory.id ? (
                        <tr
                          key={accessory.id}
                          className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 last:border-b-0"
                        >
                          <td className="px-5 py-3 text-sm font-semibold text-foreground">
                            {formatAccessoryLabel(accessory)}
                          </td>
                          <td className="px-5 py-3">
                            <Input
                              value={accessoryEditDraft.quantity}
                              onChange={(event) => {
                                setAccessoryEditDraft((current) => ({
                                  ...current,
                                  quantity: event.target.value,
                                }));
                              }}
                              inputMode="numeric"
                              aria-label="Cantidad"
                              className="ml-auto h-10 w-20 text-right"
                              disabled={isSavingAccessoryEdit}
                            />
                          </td>
                          {hasPricingAccess && (
                            <td className="px-5 py-3">
                              <Input
                                value={accessoryEditDraft.unitPrice}
                                onChange={(event) => {
                                  setAccessoryEditDraft((current) => ({
                                    ...current,
                                    unitPrice: event.target.value,
                                  }));
                                }}
                                inputMode="decimal"
                                aria-label="Precio"
                                className="ml-auto h-10 w-28 text-right"
                                disabled={isSavingAccessoryEdit}
                              />
                            </td>
                          )}
                          {hasPricingAccess && (
                            <td className="px-5 py-3 text-right font-mono text-sm text-muted-foreground">—</td>
                          )}
                          <td className="px-5 py-3">
                            <Input
                              value={accessoryEditDraft.notes}
                              onChange={(event) => {
                                setAccessoryEditDraft((current) => ({
                                  ...current,
                                  notes: event.target.value,
                                }));
                              }}
                              aria-label="Notas"
                              maxLength={255}
                              className="h-10"
                              disabled={isSavingAccessoryEdit}
                            />
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setEditingAccessoryId(null);
                                }}
                                disabled={isSavingAccessoryEdit}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                onClick={() => {
                                  void handleSaveAccessoryEdit(accessory);
                                }}
                                isLoading={isSavingAccessoryEdit}
                                loadingText="Guardando…"
                              >
                                Guardar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr
                          key={accessory.id}
                          className="border-b border-[var(--color-border-soft)] last:border-b-0"
                        >
                          <td className="px-5 py-4 text-sm font-semibold text-foreground">
                            {formatAccessoryLabel(accessory)}
                          </td>

                          <td className="px-5 py-4 text-right text-sm text-foreground">
                            {accessory.quantity}
                          </td>

                          {hasPricingAccess && (
                            <td className="px-5 py-4 text-right font-mono text-sm text-muted-foreground">
                              ₡{formatMoney(accessory.unit_price ?? 0)}
                            </td>
                          )}

                          {hasPricingAccess && (
                            <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-foreground">
                              {Number(accessory.amount ?? 0) > 0
                                ? `₡${formatMoney(accessory.amount ?? 0)}`
                                : "Incluido"}
                            </td>
                          )}

                          <td className="px-5 py-4 text-sm text-muted-foreground">
                            {accessory.notes || "—"}
                          </td>

                          {canManage && (
                            <td className="px-5 py-4">
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => {
                                    startEditingAccessory(accessory);
                                  }}
                                  disabled={
                                    accessoryActionState.pendingDeleteId !== null ||
                                    editingAccessoryId !== null
                                  }
                                >
                                  Editar
                                </Button>

                                <Button
                                  type="button"
                                  variant="danger"
                                  isLoading={accessoryActionState.pendingDeleteId === accessory.id}
                                  loadingText="Quitando…"
                                  onClick={() => {
                                    void handleDeleteAccessory(accessory);
                                  }}
                                  disabled={
                                    accessoryActionState.isSubmitting ||
                                    editingAccessoryId !== null ||
                                    (accessoryActionState.pendingDeleteId !== null &&
                                      accessoryActionState.pendingDeleteId !== accessory.id)
                                  }
                                >
                                  Quitar
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/*
            La acción que hace avanzar el servicio va al final de la página y
            de ancho completo, igual que "Confirmar compra" en el detalle de
            compra. Las tres son excluyentes (dependen del estado), así que
            acá siempre se ve una sola. Anular, Descargar factura y Volver se
            quedan en el encabezado, también como en compras.
          */}
          {loadState.serviceRecord.status === "RECEIVED" && hasWriteAccess && (
            <Button
              type="button"
              variant="primary"
              className="w-full"
              isLoading={transitionState.pendingAction === "start"}
              loadingText="Iniciando…"
              onClick={() => {
                void runTransition("start", null, startServiceRecord);
              }}
            >
              Iniciar
            </Button>
          )}

          {loadState.serviceRecord.status === "IN_PROGRESS" && hasWriteAccess && (
            <Button
              type="button"
              variant="primary"
              className="w-full"
              isLoading={transitionState.pendingAction === "mark-ready"}
              loadingText="Marcando…"
              onClick={() => {
                void runTransition("mark-ready", null, markServiceRecordReady);
              }}
            >
              Marcar listo
            </Button>
          )}

          {loadState.serviceRecord.status === "READY" && hasPricingAccess && (
            <Button
              type="button"
              variant="primary"
              className="w-full"
              isLoading={transitionState.pendingAction === "deliver"}
              loadingText="Entregando…"
              disabled={loadState.serviceRecord.price === null}
              title={
                loadState.serviceRecord.price === null
                  ? "Agregue una línea de cobro o un accesorio antes de entregarlo, para que se cuente en el cierre de caja."
                  : undefined
              }
              onClick={() => {
                void runTransition(
                  "deliver",
                  "¿Confirmar la entrega de este inyector al cliente?",
                  deliverServiceRecord,
                );
              }}
            >
              Entregar
            </Button>
          )}

          {loadState.serviceRecord.status === "READY" &&
            hasWriteAccess &&
            !hasPricingAccess && (
              <p className="rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] px-5 py-4 text-sm font-medium text-[var(--color-primary)] ring-1 ring-[rgb(7_81_132_/_12%)]">
                Listo para entregar. La entrega y el cobro los hace el Administrador.
              </p>
            )}
        </div>
      )}
    </AppShell>
  );
}
