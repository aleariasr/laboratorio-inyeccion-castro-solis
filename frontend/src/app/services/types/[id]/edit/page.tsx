"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canPriceServices } from "@/features/auth/permissions";
import { getServiceType, updateServiceType } from "@/features/services/api";
import { mapServiceTypeApiFieldErrors } from "@/features/services/form-errors";
import { ServiceTypeForm } from "@/features/services/service-type-form";
import {
  buildServiceTypeWritePayload,
  serviceTypeToFormValues,
  type ServiceTypeDetail,
  type ServiceTypeFormErrors,
  type ServiceTypeFormValues,
} from "@/features/services/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";
import { goBackOr } from "@/lib/navigation/go-back";

type LoadState =
  | { status: "loading" }
  | { status: "success"; serviceType: ServiceTypeDetail }
  | { status: "error"; message: string };

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiTimeoutError) {
    return "La consulta tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.status === 404 ? "El tipo de servicio no existe." : error.message;
  }

  return fallback;
}

export default function EditServiceTypePage() {
  const router = useRouter();

  const params = useParams<{ id: string }>();

  const serviceTypeId = Number(params.id);

  const isValidId = Number.isInteger(serviceTypeId) && serviceTypeId > 0;

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<ServiceTypeFormErrors>({});

  const hasAccess = user ? canPriceServices(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasAccess ||
      !isValidId
    ) {
      return;
    }

    const controller = new AbortController();

    getServiceType(token, serviceTypeId, controller.signal)
      .then((serviceType) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", serviceType });
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

        setLoadState({
          status: "error",
          message: getErrorMessage(error, "No fue posible cargar el tipo de servicio."),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasAccess, isValidId, logout, router, serviceTypeId, token]);

  function returnToList(): void {
    goBackOr(router, "/services/types");
  }

  async function handleSubmit(values: ServiceTypeFormValues): Promise<void> {
    if (!token || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      await updateServiceType(token, serviceTypeId, buildServiceTypeWritePayload(values));
      returnToList();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        setServerErrors(mapServiceTypeApiFieldErrors(error.fieldErrors));
      }

      setSubmitError(getErrorMessage(error, "No fue posible guardar los cambios."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authStatus === "authenticated" && user && !hasAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Los tipos de servicio y sus precios los administra el Administrador."
      >
        <StatePanel
          title="No puede editar tipos de servicio"
          message="Los permisos de cada usuario los asigna el Administrador."
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

  return (
    <AppShell
      title={
        loadState.status === "success"
          ? loadState.serviceType.name
          : "Editar tipo de servicio"
      }
      description="Precio de mano de obra y qué incluye."
    >
      {isValidId && loadState.status === "loading" && (
        <LoadingState message="Consultando tipo de servicio…" />
      )}

      {(!isValidId || loadState.status === "error") && (
        <StatePanel
          title="No se pudo cargar el tipo de servicio"
          message={
            loadState.status === "error"
              ? loadState.message
              : "La dirección no corresponde a un tipo de servicio."
          }
          tone="error"
          action={
            <Button type="button" variant="secondary" onClick={returnToList}>
              Volver
            </Button>
          }
        />
      )}

      {loadState.status === "success" && (
        <ServiceTypeForm
          mode="edit"
          initialValues={serviceTypeToFormValues(loadState.serviceType)}
          isSubmitting={isSubmitting}
          submitError={submitError}
          serverErrors={serverErrors}
          onSubmit={handleSubmit}
          onCancel={returnToList}
        />
      )}
    </AppShell>
  );
}
