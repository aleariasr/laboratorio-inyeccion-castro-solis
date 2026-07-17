"use client";

import { useParams, useRouter } from "next/navigation";
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
  getActiveLocations,
  getProduct,
  updateProduct,
} from "@/features/inventory/products/api";
import { mapProductApiFieldErrors } from "@/features/inventory/products/form-errors";
import { ProductForm } from "@/features/inventory/products/product-form";
import {
  buildProductWritePayload,
  productToFormValues,
  type Product,
  type ProductFormErrors,
  type ProductFormValues,
  type StorageLocationSummary,
} from "@/features/inventory/products/types";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      product: null;
      locations: [];
      message: null;
    }
  | {
      status: "success";
      product: Product;
      locations: StorageLocationSummary[];
      message: null;
    }
  | {
      status:
        | "not-found"
        | "forbidden"
        | "error";
      product: null;
      locations: [];
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

  return "No fue posible preparar la edición del producto.";
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

function includeCurrentLocation(
  product: Product,
  activeLocations: StorageLocationSummary[],
): StorageLocationSummary[] {
  const currentLocation =
    product.storage_location_detail;

  const alreadyIncluded =
    activeLocations.some(
      (location) =>
        location.id === currentLocation.id,
    );

  if (alreadyIncluded) {
    return activeLocations;
  }

  return [
    currentLocation,
    ...activeLocations,
  ];
}

export default function EditProductPage() {
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
      product: null,
      locations: [],
      message: null,
    });

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [submitError, setSubmitError] =
    useState<string | null>(null);

  const [serverErrors, setServerErrors] =
    useState<ProductFormErrors>({});

  const productId = Number(params.id);

  const hasWriteAccess =
    user ? canWriteInventory(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasWriteAccess ||
      !Number.isInteger(productId) ||
      productId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    Promise.all([
      getProduct(
        token,
        productId,
        controller.signal,
      ),
      getActiveLocations(
        token,
        controller.signal,
      ),
    ])
      .then(([product, locationsResponse]) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({
          status: "success",
          product,
          locations: includeCurrentLocation(
            product,
            locationsResponse.results,
          ),
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
            product: null,
            locations: [],
            message:
              "Este usuario no tiene permisos para editar productos.",
          });

          return;
        }

        if (
          error instanceof ApiError &&
          error.status === 404
        ) {
          setLoadState({
            status: "not-found",
            product: null,
            locations: [],
            message:
              "El producto solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          product: null,
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
    productId,
    router,
    token,
  ]);

  async function handleSubmit(
    values: ProductFormValues,
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
      const product = await updateProduct(
        token,
        loadState.product.id,
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
          "Este usuario no tiene permisos para editar productos.",
        );
        return;
      }

      if (
        error instanceof ApiError &&
        error.status === 404
      ) {
        setSubmitError(
          "El producto ya no existe o dejó de estar disponible.",
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

  function goToProduct(): void {
    router.push(
      `/inventory/products/${productId}`,
    );
  }

  if (
    !Number.isInteger(productId) ||
    productId <= 0
  ) {
    return (
      <AppShell
        title="Producto no válido"
        description="La dirección proporcionada no identifica un producto."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al catálogo y seleccione un producto válido."
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
          title="No puede editar productos"
          message="Su usuario puede consultar el inventario, pero no modificarlo."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={goToProduct}
            >
              Volver al producto
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
          ? `Editar ${loadState.product.name}`
          : "Editar producto"
      }
      description={
        loadState.status === "success"
          ? loadState.product.standard_code
          : "Modifique la información administrativa del producto."
      }
      actions={
        <Button
          type="button"
          variant="secondary"
          onClick={goToProduct}
          disabled={isSubmitting}
        >
          <ArrowLeftIcon />
          Volver
        </Button>
      }
    >
      {loadState.status === "loading" && (
        <LoadingState message="Preparando producto para edición…" />
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
              onClick={goToProduct}
            >
              Volver al producto
            </Button>
          }
        />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Producto no encontrado"
          message={loadState.message}
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

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo preparar la edición"
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
        <ProductForm
          key={loadState.product.id}
          mode="edit"
          initialValues={productToFormValues(
            loadState.product,
          )}
          locations={loadState.locations}
          isSubmitting={isSubmitting}
          submitError={submitError}
          serverErrors={serverErrors}
          onSubmit={handleSubmit}
          onCancel={goToProduct}
        />
      )}
    </AppShell>
  );
}