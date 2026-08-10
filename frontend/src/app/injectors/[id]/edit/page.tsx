"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteCustomers } from "@/features/auth/permissions";
import { getInjector, updateInjector } from "@/features/injectors/api";
import { mapInjectorApiFieldErrors } from "@/features/injectors/form-errors";
import { InjectorForm } from "@/features/injectors/injector-form";
import {
  buildInjectorWritePayload,
  injectorToFormValues,
  type Injector,
  type InjectorFormErrors,
  type InjectorFormValues,
} from "@/features/injectors/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      injector: null;
      message: null;
    }
  | {
      status: "success";
      injector: Injector;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      injector: null;
      message: string;
    };

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

  return "No fue posible consultar el inyector.";
}

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La actualización tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible guardar los cambios.";
}

export default function EditInjectorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    injector: null,
    message: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<InjectorFormErrors>({});

  const injectorId = Number(params.id);

  const hasWriteAccess = user ? canWriteCustomers(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasWriteAccess ||
      !Number.isInteger(injectorId) ||
      injectorId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getInjector(token, injectorId, controller.signal)
      .then((injector) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", injector, message: null });
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
            injector: null,
            message: "Este usuario no tiene permisos para editar inyectores.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            injector: null,
            message: "El inyector solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          injector: null,
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasWriteAccess, injectorId, logout, router, token]);

  async function handleSubmit(values: InjectorFormValues): Promise<void> {
    if (!token || isSubmitting || loadState.status !== "success") {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const payload = buildInjectorWritePayload(values);

      await updateInjector(token, loadState.injector.id, {
        injector_number: payload.injector_number,
        description: payload.description,
        notes: payload.notes,
        is_active: payload.is_active,
      });

      router.replace(`/injectors/${loadState.injector.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para editar inyectores.");
        return;
      }

      if (error instanceof ApiError && error.status === 404) {
        setSubmitError("El inyector ya no existe o dejó de estar disponible.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapInjectorApiFieldErrors(error.fieldErrors);

        setServerErrors(mappedErrors);

        if (Object.keys(mappedErrors).length === 0) {
          setSubmitError(error.message);
        }

        return;
      }

      setSubmitError(getSubmitErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function returnToInjectorDetail(): void {
    router.push(`/injectors/${injectorId}`);
  }

  if (!Number.isInteger(injectorId) || injectorId <= 0) {
    return (
      <AppShell
        title="Inyector no válido"
        description="La dirección proporcionada no identifica un inyector."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un inyector válido."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/injectors");
              }}
            >
              Volver a inyectores
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (authStatus === "authenticated" && user && !hasWriteAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en clientes."
      >
        <StatePanel
          title="No puede editar inyectores"
          message="Su usuario puede consultar inyectores, pero no modificarlos."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/injectors");
              }}
            >
              Volver a inyectores
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
          ? `Editar ${loadState.injector.injector_number}`
          : "Editar inyector"
      }
      description={
        loadState.status === "success"
          ? loadState.injector.customer_detail.display_name
          : "Modifique la información registrada del inyector."
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando inyector…" />}

      {loadState.status === "forbidden" && (
        <StatePanel
          title="Acceso restringido"
          message={loadState.message}
          tone="warning"
          action={
            <Button type="button" variant="secondary" onClick={returnToInjectorDetail}>
              Volver al detalle
            </Button>
          }
        />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Inyector no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/injectors");
              }}
            >
              Volver a inyectores
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el inyector"
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
        <InjectorForm
          key={loadState.injector.id}
          mode="edit"
          initialValues={injectorToFormValues(loadState.injector)}
          customerDisplayLabel={loadState.injector.customer_detail.display_name}
          token={token ?? ""}
          isSubmitting={isSubmitting}
          submitError={submitError}
          serverErrors={serverErrors}
          onSubmit={handleSubmit}
          onCancel={returnToInjectorDetail}
        />
      )}
    </AppShell>
  );
}
