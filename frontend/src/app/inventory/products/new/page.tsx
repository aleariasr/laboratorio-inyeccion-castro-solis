"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canWriteInventory } from "@/features/auth/permissions";
import {
  createProduct,
  getActiveLocations,
} from "@/features/inventory/products/api";
import { mapProductApiFieldErrors } from "@/features/inventory/products/form-errors";
import { ProductForm } from "@/features/inventory/products/product-form";
import {
  buildProductWritePayload,
  EMPTY_PRODUCT_FORM_VALUES,
  type ProductFormErrors,
  type ProductFormValues,
  type StorageLocationSummary,
} from "@/features/inventory/products/types";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";

type LocationsState =
  | {
      status: "loading";
      locations: [];
      message: null;
    }
  | {
      status: "success";
      locations: StorageLocationSummary[];
      message: null;
    }
  | {
      status: "forbidden" | "error";
      locations: [];
      message: string;
    };

function getLoadErrorMessage(
  error: unknown,
): string {
  if (error instanceof ApiTimeoutError) {
    return "La consulta de ubicaciones tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible consultar las ubicaciones disponibles.";
}

function getSubmitErrorMessage(
  error: unknown,
): string {
  if (error instanceof ApiTimeoutError) {
    return "La creación del producto tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible crear el producto.";
}

export default function NewProductPage() {
  const router = useRouter();

  const {
    status: authStatus,
    user,
    token,
    logout,
  } = useAuth();

  const [locationsState, setLocationsState] =
    useState<LocationsState>({
      status: "loading",
      locations: [],
      message: null,
    });

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [submitError, setSubmitError] =
    useState<string | null>(null);

  const [serverErrors, setServerErrors] =
    useState<ProductFormErrors>({});

  const hasWriteAccess =
    user ? canWriteInventory(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasWriteAccess
    ) {
      return;
    }

    const controller = new AbortController();

    getActiveLocations(
      token,
      controller.signal,
    )
      .then((locations) => {
        if (controller.signal.aborted) {
          return;
        }

        setLocationsState({
          status: "success",
          locations,
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
          setLocationsState({
            status: "forbidden",
            locations: [],
            message:
              "Este usuario no tiene permisos para administrar productos.",
          });

          return;
        }

        setLocationsState({
          status: "error",
          locations: [],
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    authStatus,
    hasWriteAccess,
    logout,
    router,
    token,
  ]);

  async function handleSubmit(
    values: ProductFormValues,
  ): Promise<void> {
    if (!token || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      const product = await createProduct(
        token,
        buildProductWritePayload(values),
      );

      router.replace(
        `/inventory/products/${product.id}`,
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
          "Este usuario no tiene permisos para crear productos.",
        );
        return;
      }

      if (
        error instanceof ApiError &&
        error.status === 400
      ) {
        const mappedErrors =
          mapProductApiFieldErrors(
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
    router.push("/inventory/products");
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
          title="No puede crear productos"
          message="Su usuario puede consultar el inventario, pero no modificarlo."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace(
                  "/inventory/products",
                );
              }}
            >
              Volver al catálogo
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Nuevo producto"
      description="Registre una pieza nueva en el catálogo de inventario."
      actions={
        <Button
          type="button"
          variant="secondary"
          onClick={handleCancel}
          disabled={isSubmitting}
        >
          <ArrowLeftIcon />
          Volver
        </Button>
      }
    >
      {locationsState.status === "loading" && (
        <LoadingState message="Consultando ubicaciones activas…" />
      )}

      {locationsState.status === "forbidden" && (
        <StatePanel
          title="Acceso restringido"
          message={locationsState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace(
                  "/inventory/products",
                );
              }}
            >
              Volver al catálogo
            </Button>
          }
        />
      )}

      {locationsState.status === "error" && (
        <StatePanel
          title="No se pudieron cargar las ubicaciones"
          message={locationsState.message}
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

      {locationsState.status === "success" &&
        locationsState.locations.length === 0 && (
          <StatePanel
            title="No hay ubicaciones activas"
            message="Debe registrar o reactivar al menos una ubicación antes de crear productos."
            tone="warning"
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  router.replace(
                    "/inventory/products",
                  );
                }}
              >
                Volver al catálogo
              </Button>
            }
          />
        )}

      {locationsState.status === "success" &&
        locationsState.locations.length > 0 && (
          <ProductForm
            mode="create"
            initialValues={
              EMPTY_PRODUCT_FORM_VALUES
            }
            locations={
              locationsState.locations
            }
            isSubmitting={isSubmitting}
            submitError={submitError}
            serverErrors={serverErrors}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        )}
    </AppShell>
  );
}
