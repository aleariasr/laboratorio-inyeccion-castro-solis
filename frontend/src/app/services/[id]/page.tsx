"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/form-error";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canCancelServices, canReadInjectors, canReadServices, canWriteInjectors, canWriteServices } from "@/features/auth/permissions";
import { formatDate } from "@/features/inventory/purchases/format";
import {
  cancelServiceRecord,
  createServiceAccessory,
  deleteServiceAccessory,
  deliverServiceRecord,
  getServiceAccessories,
  getServiceRecord,
  markServiceRecordReady,
  startServiceRecord,
  updateServiceAccessory,
  updateServiceRecordTechnicalData,
} from "@/features/services/api";
import { mapServiceAccessoryApiFieldErrors, mapServiceRecordTechnicalApiFieldErrors } from "@/features/services/form-errors";
import { ServiceAccessoryForm } from "@/features/services/service-accessory-form";
import { ServiceTechnicalForm } from "@/features/services/service-technical-form";
import {
  buildServiceAccessoryWritePayload,
  buildServiceRecordTechnicalWritePayload,
  EMPTY_SERVICE_ACCESSORY_FORM_VALUES,
  serviceRecordToTechnicalFormValues,
  type ServiceAccessory,
  type ServiceAccessoryFormErrors,
  type ServiceAccessoryFormValues,
  type ServiceRecord,
  type ServiceRecordTechnicalFormErrors,
  type ServiceRecordTechnicalFormValues,
  type ServiceStatus,
} from "@/features/services/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      serviceRecord: null;
      accessories: [];
      message: null;
    }
  | {
      status: "success";
      serviceRecord: ServiceRecord;
      accessories: ServiceAccessory[];
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      serviceRecord: null;
      accessories: [];
      message: string;
    };

type AccessoryFormState =
  | { mode: "closed"; accessory: null }
  | { mode: "create"; accessory: null }
  | { mode: "edit"; accessory: ServiceAccessory };

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
  return serviceAccessory.accessory_detail.name;
}

export default function ServiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    serviceRecord: null,
    accessories: [],
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

  const [transitionState, setTransitionState] = useState<TransitionState>({
    pendingAction: null,
    error: null,
  });

  const [accessoryFormState, setAccessoryFormState] = useState<AccessoryFormState>({
    mode: "closed",
    accessory: null,
  });

  const [accessoryActionState, setAccessoryActionState] = useState<AccessoryActionState>({
    isSubmitting: false,
    submitError: null,
    fieldErrors: {},
    pendingDeleteId: null,
  });

  const serviceRecordId = Number(params.id);

  const hasCustomersAccess = user ? canReadServices(user) : false;

  const hasWriteAccess = user ? canWriteServices(user) : false;

  const hasInjectorsAccess = user ? canReadInjectors(user) : false;

  const hasInjectorsWriteAccess = user ? canWriteInjectors(user) : false;

  const hasCancelAccess = user ? canCancelServices(user) : false;

  const canManage =
    loadState.status === "success" &&
    loadState.serviceRecord.status !== "DELIVERED" &&
    loadState.serviceRecord.status !== "CANCELLED" &&
    hasWriteAccess;

  const accessoryFormInitialValues =
    accessoryFormState.mode === "edit"
      ? {
          accessoryId: String(accessoryFormState.accessory.accessory),
          quantity: String(accessoryFormState.accessory.quantity),
          notes: accessoryFormState.accessory.notes,
        }
      : EMPTY_SERVICE_ACCESSORY_FORM_VALUES;

  const accessoryFormKey =
    accessoryFormState.mode === "edit" ? `edit-${accessoryFormState.accessory.id}` : "create";

  const accessoryDisplayLabel =
    accessoryFormState.mode === "edit" ? formatAccessoryLabel(accessoryFormState.accessory) : undefined;

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
    ])
      .then(([serviceRecord, accessories]) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", serviceRecord, accessories, message: null });
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
            message: "Este usuario no tiene permisos para consultar servicios.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            serviceRecord: null,
            accessories: [],
            message: "El servicio solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          serviceRecord: null,
          accessories: [],
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasCustomersAccess, logout, router, serviceRecordId, token]);

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

  async function runTransition(
    action: TransitionAction,
    confirmMessage: string | null,
    apiCall: (token: string, id: number) => Promise<ServiceRecord>,
  ): Promise<void> {
    if (!token || loadState.status !== "success") {
      return;
    }

    if (confirmMessage && !globalThis.confirm(confirmMessage)) {
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

  function openCreateAccessoryForm(): void {
    setAccessoryActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingDeleteId: null,
    });

    setAccessoryFormState({ mode: "create", accessory: null });
  }

  function openEditAccessoryForm(accessory: ServiceAccessory): void {
    setAccessoryActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingDeleteId: null,
    });

    setAccessoryFormState({ mode: "edit", accessory });
  }

  function closeAccessoryForm(): void {
    if (accessoryActionState.isSubmitting) {
      return;
    }

    setAccessoryFormState({ mode: "closed", accessory: null });

    setAccessoryActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingDeleteId: null,
    });
  }

  function updateAccessoriesInState(updated: ServiceAccessory): void {
    setLoadState((current) => {
      if (current.status !== "success") {
        return current;
      }

      const exists = current.accessories.some((item) => item.id === updated.id);

      const accessories = exists
        ? current.accessories.map((item) => (item.id === updated.id ? updated : item))
        : [...current.accessories, updated];

      return { ...current, accessories };
    });
  }

  function removeAccessoryFromState(accessoryId: number): void {
    setLoadState((current) => {
      if (current.status !== "success") {
        return current;
      }

      return {
        ...current,
        accessories: current.accessories.filter((item) => item.id !== accessoryId),
      };
    });
  }

  async function handleAccessorySubmit(values: ServiceAccessoryFormValues): Promise<void> {
    if (!token || loadState.status !== "success" || accessoryFormState.mode === "closed") {
      return;
    }

    setAccessoryActionState((current) => ({
      ...current,
      isSubmitting: true,
      submitError: null,
      fieldErrors: {},
    }));

    try {
      const saved =
        accessoryFormState.mode === "create"
          ? await createServiceAccessory(
              token,
              buildServiceAccessoryWritePayload(loadState.serviceRecord.id, values),
            )
          : await updateServiceAccessory(token, accessoryFormState.accessory.id, {
              quantity: Number(values.quantity),
              notes: values.notes.trim(),
            });

      updateAccessoriesInState(saved);

      setAccessoryFormState({ mode: "closed", accessory: null });

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

    if (!globalThis.confirm(`¿Eliminar el accesorio ${formatAccessoryLabel(accessory)}?`)) {
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

      removeAccessoryFromState(accessory.id);

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
          {loadState.status === "success" && loadState.serviceRecord.status === "RECEIVED" && hasWriteAccess && (
            <Button
              type="button"
              isLoading={transitionState.pendingAction === "start"}
              loadingText="Iniciando…"
              onClick={() => {
                void runTransition("start", null, startServiceRecord);
              }}
            >
              Iniciar
            </Button>
          )}

          {loadState.status === "success" && loadState.serviceRecord.status === "IN_PROGRESS" && hasWriteAccess && (
            <Button
              type="button"
              isLoading={transitionState.pendingAction === "mark-ready"}
              loadingText="Marcando…"
              onClick={() => {
                void runTransition("mark-ready", null, markServiceRecordReady);
              }}
            >
              Marcar listo
            </Button>
          )}

          {loadState.status === "success" && loadState.serviceRecord.status === "READY" && hasWriteAccess && (
            <Button
              type="button"
              isLoading={transitionState.pendingAction === "deliver"}
              loadingText="Entregando…"
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
                  Piezas usadas durante el servicio.
                </p>
              </div>

              {canManage && accessoryFormState.mode === "closed" && (
                <Button type="button" onClick={openCreateAccessoryForm}>
                  Agregar accesorio
                </Button>
              )}
            </div>

            {accessoryActionState.submitError && accessoryFormState.mode === "closed" && (
              <div className="border-b border-[var(--color-border-soft)] p-6">
                <FormError message={accessoryActionState.submitError} />
              </div>
            )}

            {accessoryFormState.mode !== "closed" && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-6">
                <div className="mb-5">
                  <h3 className="text-base font-semibold text-foreground">
                    {accessoryFormState.mode === "create" ? "Agregar accesorio" : "Editar accesorio"}
                  </h3>
                </div>

                <ServiceAccessoryForm
                  key={accessoryFormKey}
                  canReadInjectors={hasInjectorsAccess}
                  canWriteInjectors={hasInjectorsWriteAccess}
                  mode={accessoryFormState.mode}
                  initialValues={accessoryFormInitialValues}
                  accessoryDisplayLabel={accessoryDisplayLabel}
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
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Accesorio
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Cantidad
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Notas
                      </th>

                      {canManage && (
                        <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Acciones
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {loadState.accessories.map((accessory) => (
                      <tr
                        key={accessory.id}
                        className="border-b border-[var(--color-border-soft)] last:border-b-0"
                      >
                        <td className="px-5 py-4 text-sm font-semibold text-foreground">
                          {accessory.accessory_detail.name}
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">{accessory.quantity}</td>

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
                                  openEditAccessoryForm(accessory);
                                }}
                                disabled={
                                  accessoryActionState.isSubmitting ||
                                  accessoryActionState.pendingDeleteId !== null
                                }
                              >
                                Editar
                              </Button>

                              <Button
                                type="button"
                                variant="danger"
                                isLoading={accessoryActionState.pendingDeleteId === accessory.id}
                                loadingText="Eliminando…"
                                onClick={() => {
                                  void handleDeleteAccessory(accessory);
                                }}
                                disabled={
                                  accessoryActionState.isSubmitting ||
                                  (accessoryActionState.pendingDeleteId !== null &&
                                    accessoryActionState.pendingDeleteId !== accessory.id)
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
