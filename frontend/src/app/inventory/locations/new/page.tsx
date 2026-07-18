"use client";

import { useRouter } from "next/navigation";
import {
  useState,
} from "react";

import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteInventory } from "@/features/auth/permissions";
import { createStorageLocation } from "@/features/inventory/locations/api";
import { mapStorageLocationApiFieldErrors } from "@/features/inventory/locations/form-errors";
import { LocationForm } from "@/features/inventory/locations/location-form";
import {
  buildStorageLocationWritePayload,
  EMPTY_STORAGE_LOCATION_FORM_VALUES,
  type StorageLocationFormErrors,
  type StorageLocationFormValues,
} from "@/features/inventory/locations/types";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";

function getSubmitErrorMessage(
  error: unknown,
): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación de la ubicación tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear la ubicación.";
}

export default function NewStorageLocationPage() {
  const router = useRouter();

  const {
    status: authStatus,
    user,
    token,
    logout,
  } = useAuth();

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [submitError, setSubmitError] =
    useState<string | null>(null);

  const [serverErrors, setServerErrors] =
    useState<StorageLocationFormErrors>({});

  const hasWriteAccess =
    user ? canWriteInventory(user) : false;

  async function handleSubmit(
    values: StorageLocationFormValues,
  ): Promise<void> {
    if (
      !token ||
      isSubmitting ||
      !hasWriteAccess
    ) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      await createStorageLocation(
        token,
        buildStorageLocationWritePayload(values),
      );

      router.replace(
        "/inventory/locations",
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
          "Este usuario no tiene permisos para crear ubicaciones.",
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

  function handleCancel(): void {
    router.push(
      "/inventory/locations",
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
          title="No puede crear ubicaciones"
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
      title="Nueva ubicación"
      description="Registre un espacio físico para almacenar productos."
    >
      <LocationForm
        mode="create"
        initialValues={
          EMPTY_STORAGE_LOCATION_FORM_VALUES
        }
        isSubmitting={isSubmitting}
        submitError={submitError}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </AppShell>
  );
}
