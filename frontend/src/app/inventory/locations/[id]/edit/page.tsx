"use client";

import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteInventory } from "@/features/auth/permissions";
import {
  getStorageLocation,
  updateStorageLocation,
} from "@/features/inventory/locations/api";
import { mapStorageLocationApiFieldErrors } from "@/features/inventory/locations/form-errors";
import { LocationForm } from "@/features/inventory/locations/location-form";
import {
  buildStorageLocationWritePayload,
  storageLocationToFormValues,
  type StorageLocation,
  type StorageLocationFormErrors,
  type StorageLocationFormValues,
} from "@/features/inventory/locations/types";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      location: null;
      message: null;
    }
  | {
      status: "success";
      location: StorageLocation;
      message: null;
    }
  | {
      status:
        | "not-found"
        | "forbidden"
        | "error";
      location: null;
      message: string;
    };

function getLoadErrorMessage(
  error: unknown,
): string {
  if (error instanceof ApiTimeoutError) {
    return "La consulta tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible consultar la ubicación.";
}

function getSubmitErrorMessage(
  error: unknown,
): string {
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

export default function EditStorageLocationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const {
    status: authStatus,
    user,
    token,
    logout,
  } = useAuth();

  const [loadState, setLoadState] =
    useState<LoadState>({
      status: "loading",
      location: null,
      message: null,
    });

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [submitError, setSubmitError] =
    useState<string | null>(null);

  const [serverErrors, setServerErrors] =
    useState<StorageLocationFormErrors>({});

  const locationId = Number(params.id);

  const hasWriteAccess =
    user ? canWriteInventory(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasWriteAccess ||
      !Number.isInteger(locationId) ||
      locationId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getStorageLocation(
      token,
      locationId,
      controller.signal,
    )
      .then((location) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({
          status: "success",
          location,
          message: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          void logout().then(() => {
            router.replace("/login");
          });

          return;
        }

        if (
          error instanceof ApiError &&
          error.status === 403
        ) {
          setLoadState({
            status: "forbidden",
            location: null,
            message:
              "Este usuario no tiene permisos para editar ubicaciones.",
          });

          return;
        }

        if (
          error instanceof ApiError &&
          error.status === 404
        ) {
          setLoadState({
            status: "not-found",
            location: null,
            message:
              "La ubicación solicitada no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          location: null,
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    authStatus,
    hasWriteAccess,
    locationId,
    logout,
    router,
    token,
  ]);

  async function handleSubmit(
    values: StorageLocationFormValues,
  ): Promise<void> {
    if (
      !token ||
      isSubmitting ||
      loadState.status !== "success"
    ) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      await updateStorageLocation(
        token,
        loadState.location.id,
        buildStorageLocationWritePayload(values),
      );

      router.replace(
        `/inventory/locations/${loadState.location.id}`,
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        await logout();
        router.replace("/login");
        return;
      }

      if (
        error instanceof ApiError &&
        error.status === 403
      ) {
        setSubmitError(
          "Este usuario no tiene permisos para editar ubicaciones.",
        );
        return;
      }

      if (
        error instanceof ApiError &&
        error.status === 404
      ) {
        setSubmitError(
          "La ubicación ya no existe o dejó de estar disponible.",
        );
        return;
      }

      if (
        error instanceof ApiError &&
        error.status === 400
      ) {
        const mappedErrors =
          mapStorageLocationApiFieldErrors(
            error.fieldErrors,
          );

        setServerErrors(mappedErrors);

        if (
          Object.keys(mappedErrors).length === 0
        ) {
          setSubmitError(error.message);
        }

        return;
      }

      setSubmitError(
        getSubmitErrorMessage(error),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function returnToLocationDetail(): void {
    router.push(
      `/inventory/locations/${locationId}`,
    );
  }

  if (
    !Number.isInteger(locationId) ||
    locationId <= 0
  ) {
    return (
      <AppShell
        title="Ubicación no válida"
        description="La dirección proporcionada no identifica una ubicación."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione una ubicación válida."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace(
                  "/inventory/locations",
                );
              }}
            >
              Volver a ubicaciones
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (
    authStatus === "authenticated" &&
    user &&
    !hasWriteAccess
  ) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de escritura en inventario."
      >
        <StatePanel
          title="No puede editar ubicaciones"
          message="Su usuario puede consultar las ubicaciones, pero no modificarlas."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace(
                  "/inventory/locations",
                );
              }}
            >
              Volver a ubicaciones
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
          ? `Editar ${loadState.location.code}`
          : "Editar ubicación"
      }
      description={
        loadState.status === "success"
          ? loadState.location.description ||
            "Ubicación física del inventario."
          : "Modifique la información administrativa de la ubicación."
      }
    >
      {loadState.status === "loading" && (
        <LoadingState message="Consultando ubicación…" />
      )}

      {loadState.status === "forbidden" && (
        <StatePanel
          title="Acceso restringido"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={returnToLocationDetail}
            >
              Volver al detalle
            </Button>
          }
        />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Ubicación no encontrada"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace(
                  "/inventory/locations",
                );
              }}
            >
              Volver a ubicaciones
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar la ubicación"
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
        <LocationForm
          key={loadState.location.id}
          mode="edit"
          initialValues={storageLocationToFormValues(
            loadState.location,
          )}
          isSubmitting={isSubmitting}
          submitError={submitError}
          serverErrors={serverErrors}
          onSubmit={handleSubmit}
          onCancel={returnToLocationDetail}
        />
      )}
    </AppShell>
  );
}
