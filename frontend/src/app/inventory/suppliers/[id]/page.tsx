"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/form-error";
import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canReadSuppliers, canWriteSuppliers } from "@/features/auth/permissions";
import {
  createSupplierProduct,
  getSupplier,
  getSupplierProducts,
  updateSupplierProduct,
  updateSupplierProductState,
} from "@/features/inventory/suppliers/api";
import { mapSupplierProductApiFieldErrors } from "@/features/inventory/suppliers/supplier-product-form-errors";
import { SupplierProductForm } from "@/features/inventory/suppliers/supplier-product-form";
import {
  buildSupplierProductWritePayload,
  EMPTY_SUPPLIER_PRODUCT_FORM_VALUES,
  supplierProductToFormValues,
  type Supplier,
  type SupplierProduct,
  type SupplierProductFormErrors,
  type SupplierProductFormValues,
} from "@/features/inventory/suppliers/types";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      supplier: null;
      supplierProducts: [];
      message: null;
    }
  | {
      status: "success";
      supplier: Supplier;
      supplierProducts: SupplierProduct[];
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      supplier: null;
      supplierProducts: [];
      message: string;
    };

type SupplierProductFormState =
  | {
      mode: "closed";
      supplierProduct: null;
    }
  | {
      mode: "create";
      supplierProduct: null;
    }
  | {
      mode: "edit";
      supplierProduct: SupplierProduct;
    };

type SupplierProductActionState = {
  isSubmitting: boolean;
  submitError: string | null;
  fieldErrors: SupplierProductFormErrors;
  pendingStateSupplierProductId: number | null;
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

  return "No fue posible consultar el proveedor.";
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

function formatProductDetailLabel(supplierProduct: SupplierProduct): string {
  return `${supplierProduct.product_detail.standard_code} — ${supplierProduct.product_detail.name}`;
}

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    supplier: null,
    supplierProducts: [],
    message: null,
  });

  const [supplierProductFormState, setSupplierProductFormState] =
    useState<SupplierProductFormState>({
      mode: "closed",
      supplierProduct: null,
    });

  const [supplierProductActionState, setSupplierProductActionState] =
    useState<SupplierProductActionState>({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingStateSupplierProductId: null,
    });

  const supplierId = Number(params.id);

  const hasInventoryAccess = user ? canReadSuppliers(user) : false;

  const hasWriteAccess = user ? canWriteSuppliers(user) : false;

  const supplierProductFormInitialValues =
    supplierProductFormState.mode === "edit"
      ? supplierProductToFormValues(supplierProductFormState.supplierProduct)
      : EMPTY_SUPPLIER_PRODUCT_FORM_VALUES;

  const supplierProductFormKey =
    supplierProductFormState.mode === "edit"
      ? `edit-${supplierProductFormState.supplierProduct.id}`
      : "create";

  const supplierProductDisplayLabel =
    supplierProductFormState.mode === "edit"
      ? formatProductDetailLabel(supplierProductFormState.supplierProduct)
      : undefined;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasInventoryAccess ||
      !Number.isInteger(supplierId) ||
      supplierId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    Promise.all([
      getSupplier(token, supplierId, controller.signal),
      getSupplierProducts(token, supplierId, controller.signal),
    ])
      .then(([supplier, supplierProducts]) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", supplier, supplierProducts, message: null });
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
            supplier: null,
            supplierProducts: [],
            message: "Este usuario no tiene permisos para consultar proveedores.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            supplier: null,
            supplierProducts: [],
            message: "El proveedor solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          supplier: null,
          supplierProducts: [],
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasInventoryAccess, logout, router, supplierId, token]);

  function goBack(): void {
    router.back();
  }

  function openCreateSupplierProductForm(): void {
    setSupplierProductActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingStateSupplierProductId: null,
    });

    setSupplierProductFormState({ mode: "create", supplierProduct: null });
  }

  function openEditSupplierProductForm(supplierProduct: SupplierProduct): void {
    setSupplierProductActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingStateSupplierProductId: null,
    });

    setSupplierProductFormState({ mode: "edit", supplierProduct });
  }

  function closeSupplierProductForm(): void {
    if (supplierProductActionState.isSubmitting) {
      return;
    }

    setSupplierProductFormState({ mode: "closed", supplierProduct: null });

    setSupplierProductActionState({
      isSubmitting: false,
      submitError: null,
      fieldErrors: {},
      pendingStateSupplierProductId: null,
    });
  }

  function updateSupplierProductInState(updated: SupplierProduct): void {
    setLoadState((current) => {
      if (current.status !== "success") {
        return current;
      }

      const exists = current.supplierProducts.some((item) => item.id === updated.id);

      const supplierProducts = exists
        ? current.supplierProducts.map((item) => (item.id === updated.id ? updated : item))
        : [...current.supplierProducts, updated];

      supplierProducts.sort((left, right) =>
        left.product_detail.standard_code.localeCompare(
          right.product_detail.standard_code,
          "es",
          { sensitivity: "base", numeric: true },
        ),
      );

      return { ...current, supplierProducts };
    });
  }

  async function handleSupplierProductSubmit(values: SupplierProductFormValues): Promise<void> {
    if (!token || loadState.status !== "success" || supplierProductFormState.mode === "closed") {
      return;
    }

    setSupplierProductActionState((current) => ({
      ...current,
      isSubmitting: true,
      submitError: null,
      fieldErrors: {},
    }));

    try {
      const payload = buildSupplierProductWritePayload(loadState.supplier.id, values);

      const saved =
        supplierProductFormState.mode === "create"
          ? await createSupplierProduct(token, payload)
          : await updateSupplierProduct(token, supplierProductFormState.supplierProduct.id, payload);

      updateSupplierProductInState(saved);

      setSupplierProductFormState({ mode: "closed", supplierProduct: null });

      setSupplierProductActionState({
        isSubmitting: false,
        submitError: null,
        fieldErrors: {},
        pendingStateSupplierProductId: null,
      });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSupplierProductActionState((current) => ({
          ...current,
          isSubmitting: false,
          submitError: "Este usuario no tiene permisos para modificar productos asociados.",
        }));

        return;
      }

      if (error instanceof ApiError) {
        const fieldErrors = mapSupplierProductApiFieldErrors(error.fieldErrors);

        setSupplierProductActionState((current) => ({
          ...current,
          isSubmitting: false,
          submitError: Object.keys(fieldErrors).length > 0 ? null : error.message,
          fieldErrors,
        }));

        return;
      }

      setSupplierProductActionState((current) => ({
        ...current,
        isSubmitting: false,
        submitError: getErrorMessage(error),
      }));
    }
  }

  async function handleSupplierProductStateChange(supplierProduct: SupplierProduct): Promise<void> {
    if (!token) {
      return;
    }

    setSupplierProductActionState((current) => ({
      ...current,
      submitError: null,
      fieldErrors: {},
      pendingStateSupplierProductId: supplierProduct.id,
    }));

    try {
      const updated = await updateSupplierProductState(
        token,
        supplierProduct.id,
        !supplierProduct.is_active,
      );

      updateSupplierProductInState(updated);

      setSupplierProductActionState((current) => ({
        ...current,
        pendingStateSupplierProductId: null,
      }));
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      const message =
        error instanceof ApiError && error.status === 403
          ? "Este usuario no tiene permisos para cambiar el estado de la asociación."
          : getErrorMessage(error);

      setSupplierProductActionState((current) => ({
        ...current,
        submitError: message,
        pendingStateSupplierProductId: null,
      }));
    }
  }

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return (
      <AppShell
        title="Proveedor no válido"
        description="La dirección proporcionada no identifica un proveedor."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un proveedor válido."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/inventory/suppliers");
              }}
            >
              Volver a proveedores
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
        description="Este módulo requiere permisos de proveedores."
      >
        <StatePanel
          title="No tiene acceso al proveedor"
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
        loadState.status === "success" ? loadState.supplier.name : "Detalle de proveedor"
      }
      description={
        loadState.status === "success"
          ? loadState.supplier.country || "Información registrada del proveedor."
          : "Información registrada del proveedor."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {loadState.status === "success" && hasWriteAccess && (
            <Button
              type="button"
              onClick={() => {
                router.push(`/inventory/suppliers/${loadState.supplier.id}/edit`);
              }}
            >
              Editar proveedor
            </Button>
          )}

          <Button type="button" variant="secondary" onClick={goBack}>
            <ArrowLeftIcon />
            Volver
          </Button>
        </div>
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando proveedor…" />}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Proveedor no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/inventory/suppliers");
              }}
            >
              Volver al catálogo
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el proveedor"
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
          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-foreground">
                  {loadState.supplier.name}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {loadState.supplier.notes || "Sin notas registradas."}
                </p>
              </div>

              <span
                className={[
                  "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                  loadState.supplier.is_active
                    ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                    : "bg-surface-muted text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "size-1.5 rounded-full",
                    loadState.supplier.is_active
                      ? "bg-[var(--color-success)]"
                      : "bg-[var(--color-text-subtle)]",
                  ].join(" ")}
                  aria-hidden="true"
                />

                {loadState.supplier.is_active ? "Activo" : "Inactivo"}
              </span>
            </div>

            <dl className="border-t border-[var(--color-border-soft)]">
              <div className="app-status-row">
                <dt>Contacto</dt>
                <dd>{loadState.supplier.contact_name || "Sin contacto registrado"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Teléfono</dt>
                <dd>{loadState.supplier.phone || "Sin teléfono registrado"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Correo electrónico</dt>
                <dd>{loadState.supplier.email || "Sin correo registrado"}</dd>
              </div>

              <div className="app-status-row">
                <dt>País</dt>
                <dd>{loadState.supplier.country || "Sin país registrado"}</dd>
              </div>

              <div className="app-status-row">
                <dt>Fecha de creación</dt>
                <dd>{formatDate(loadState.supplier.created_at)}</dd>
              </div>

              <div className="app-status-row">
                <dt>Última modificación</dt>
                <dd>{formatDate(loadState.supplier.updated_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="app-status-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[var(--color-border-soft)] p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  Productos asociados
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Piezas que este proveedor suministra, con su referencia y fabricante.
                </p>
              </div>

              {hasWriteAccess && supplierProductFormState.mode === "closed" && (
                <Button type="button" onClick={openCreateSupplierProductForm}>
                  Asociar producto
                </Button>
              )}
            </div>

            {supplierProductActionState.submitError &&
              supplierProductFormState.mode === "closed" && (
                <div className="border-b border-[var(--color-border-soft)] p-6">
                  <FormError message={supplierProductActionState.submitError} />
                </div>
              )}

            {supplierProductFormState.mode !== "closed" && (
              <div className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 p-6">
                <div className="mb-5">
                  <h3 className="text-base font-semibold text-foreground">
                    {supplierProductFormState.mode === "create"
                      ? "Asociar producto"
                      : "Editar asociación"}
                  </h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {supplierProductFormState.mode === "create"
                      ? "Busque el producto que este proveedor suministra."
                      : "Actualice los datos o el estado de la asociación seleccionada."}
                  </p>
                </div>

                <SupplierProductForm
                  key={supplierProductFormKey}
                  mode={supplierProductFormState.mode}
                  initialValues={supplierProductFormInitialValues}
                  productDisplayLabel={supplierProductDisplayLabel}
                  token={token ?? ""}
                  isSubmitting={supplierProductActionState.isSubmitting}
                  submitError={supplierProductActionState.submitError}
                  serverErrors={supplierProductActionState.fieldErrors}
                  onSubmit={handleSupplierProductSubmit}
                  onCancel={closeSupplierProductForm}
                />
              </div>
            )}

            {loadState.supplierProducts.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  Este proveedor todavía no tiene productos asociados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Producto
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Referencia
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Fabricante
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Preferido
                      </th>

                      <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Estado
                      </th>

                      {hasWriteAccess && (
                        <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Acciones
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {loadState.supplierProducts.map((supplierProduct) => (
                      <tr
                        key={supplierProduct.id}
                        className="border-b border-[var(--color-border-soft)] last:border-b-0"
                      >
                        <td className="px-5 py-4">
                          <p className="font-mono text-sm font-semibold text-foreground">
                            {supplierProduct.product_detail.standard_code}
                          </p>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {supplierProduct.product_detail.name}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">
                          {supplierProduct.supplier_reference || "Sin referencia"}
                        </td>

                        <td className="px-5 py-4 text-sm text-foreground">
                          {supplierProduct.manufacturer || "Sin fabricante"}
                        </td>

                        <td className="px-5 py-4">
                          {supplierProduct.preferred_supplier ? (
                            <span className="inline-flex items-center rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-blue)]">
                              Preferido
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                              supplierProduct.is_active
                                ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                                : "bg-surface-muted text-muted-foreground",
                            ].join(" ")}
                          >
                            {supplierProduct.is_active ? "Activa" : "Inactiva"}
                          </span>
                        </td>

                        {hasWriteAccess && (
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  openEditSupplierProductForm(supplierProduct);
                                }}
                                disabled={
                                  supplierProductActionState.isSubmitting ||
                                  supplierProductActionState.pendingStateSupplierProductId !== null
                                }
                              >
                                Editar
                              </Button>

                              <Button
                                type="button"
                                variant={supplierProduct.is_active ? "danger" : "secondary"}
                                isLoading={
                                  supplierProductActionState.pendingStateSupplierProductId ===
                                  supplierProduct.id
                                }
                                loadingText={
                                  supplierProduct.is_active ? "Inactivando…" : "Activando…"
                                }
                                onClick={() => {
                                  void handleSupplierProductStateChange(supplierProduct);
                                }}
                                disabled={
                                  supplierProductActionState.isSubmitting ||
                                  (supplierProductActionState.pendingStateSupplierProductId !== null &&
                                    supplierProductActionState.pendingStateSupplierProductId !==
                                      supplierProduct.id)
                                }
                              >
                                {supplierProduct.is_active ? "Inactivar" : "Activar"}
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
