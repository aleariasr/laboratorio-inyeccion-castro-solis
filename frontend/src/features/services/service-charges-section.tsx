"use client";

import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/features/inventory/purchases/format";
import { ApiError } from "@/lib/api/errors";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";

import {
  createServiceChargeLine,
  createServiceType,
  deleteServiceChargeLine,
  getServiceTypes,
  updateServiceChargeLine,
} from "./api";
import { mapServiceTypeApiFieldErrors } from "./form-errors";
import { ServiceTypeForm } from "./service-type-form";
import {
  EMPTY_SERVICE_TYPE_FORM_VALUES,
  buildServiceTypeWritePayload,
  type ServiceAccessory,
  type ServiceChargeLine,
  type ServiceTypeDetail,
  type ServiceTypeFormErrors,
  type ServiceTypeFormValues,
} from "./types";

type ServiceChargesSectionProps = {
  token: string;
  serviceRecordId: number;
  lines: ServiceChargeLine[];
  accessories: ServiceAccessory[];
  // price del servicio: líneas + accesorios, calculado por el backend.
  subtotal: number | null;
  canManage: boolean;
  onChanged: () => Promise<void>;
  onUnauthorized: () => void;
};

type LineDraft = {
  serviceTypeId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const EMPTY_DRAFT: LineDraft = {
  serviceTypeId: "",
  description: "",
  quantity: "1",
  unitPrice: "",
};

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

const SELECT_CLASSES =
  "h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]";

function validateDraft(draft: LineDraft): string | null {
  if (!draft.description.trim() && !draft.serviceTypeId) {
    return "Indique qué se cobra o elija un tipo de servicio.";
  }

  if (!/^\d+$/.test(draft.quantity.trim()) || Number(draft.quantity) < 1) {
    return "La cantidad debe ser un número entero de 1 o más.";
  }

  if (!DECIMAL_PATTERN.test(draft.unitPrice.trim())) {
    return "Ingrese el precio (0 o más).";
  }

  return null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Cobro por líneas de un servicio (punto 3 + 1B del plan del 2026-10-22):
 * "Mano de obra", "Limpieza × 4"… más los accesorios. El precio del
 * servicio es esa suma y lo calcula el backend; aquí solo se muestran las
 * partes. Elegir un tipo precarga su precio de mano de obra. Solo el
 * Administrador.
 */
export function ServiceChargesSection({
  token,
  serviceRecordId,
  lines,
  accessories,
  subtotal,
  canManage,
  onChanged,
  onUnauthorized,
}: ServiceChargesSectionProps) {
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDetail[]>([]);

  const [draft, setDraft] = useState<LineDraft>(EMPTY_DRAFT);

  const [isAdding, setIsAdding] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [editingLineId, setEditingLineId] = useState<number | null>(null);

  const [editDraft, setEditDraft] = useState<LineDraft>(EMPTY_DRAFT);

  const [pendingLineId, setPendingLineId] = useState<number | null>(null);

  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);

  const [typeSubmitting, setTypeSubmitting] = useState(false);

  const [typeSubmitError, setTypeSubmitError] = useState<string | null>(null);

  const [typeServerErrors, setTypeServerErrors] = useState<ServiceTypeFormErrors>({});

  useEffect(() => {
    if (!canManage) {
      return;
    }

    const controller = new AbortController();

    getServiceTypes(token, "", controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setServiceTypes(result);
        }
      })
      .catch(() => {
        // Sin catálogo igual se puede cobrar escribiendo la línea a mano.
      });

    return () => {
      controller.abort();
    };
  }, [canManage, token]);

  const linesTotal = lines.reduce((total, line) => total + Number(line.amount), 0);

  const accessoriesTotal = accessories.reduce(
    (total, accessory) => total + Number(accessory.amount ?? 0),
    0,
  );

  function handleFailure(caught: unknown, fallback: string): void {
    if (caught instanceof ApiError && caught.status === 401) {
      onUnauthorized();
      return;
    }

    setError(errorMessage(caught, fallback));
  }

  function selectType(serviceTypeId: string): void {
    const serviceType = serviceTypes.find((item) => String(item.id) === serviceTypeId);

    // Elegir un tipo precarga su nombre y su precio de mano de obra; los
    // dos se pueden cambiar antes de agregar la línea.
    setDraft((current) => ({
      ...current,
      serviceTypeId,
      description: serviceType ? serviceType.name : current.description,
      unitPrice:
        serviceType && serviceType.default_labor_price !== null
          ? String(Number(serviceType.default_labor_price))
          : current.unitPrice,
    }));
    setError(null);
  }

  async function handleAddLine(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const validationError = validateDraft(draft);

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsAdding(true);
    setError(null);

    const serviceType =
      serviceTypes.find((item) => String(item.id) === draft.serviceTypeId) ?? null;

    try {
      await createServiceChargeLine(token, {
        service_record: serviceRecordId,
        service_type: serviceType ? serviceType.id : null,
        description: draft.description.trim(),
        quantity: Number(draft.quantity),
        unit_price: draft.unitPrice.trim(),
      });

      setDraft(EMPTY_DRAFT);

      await onChanged();
    } catch (caught: unknown) {
      handleFailure(caught, "No fue posible agregar la línea.");
    } finally {
      setIsAdding(false);
    }
  }

  function startEditing(line: ServiceChargeLine): void {
    setEditingLineId(line.id);
    setEditDraft({
      serviceTypeId: line.service_type ? String(line.service_type) : "",
      description: line.description,
      quantity: String(line.quantity),
      unitPrice: String(Number(line.unit_price)),
    });
    setError(null);
  }

  async function handleSaveLine(line: ServiceChargeLine): Promise<void> {
    const validationError = validateDraft(editDraft);

    if (validationError) {
      setError(validationError);
      return;
    }

    setPendingLineId(line.id);
    setError(null);

    try {
      await updateServiceChargeLine(token, line.id, {
        description: editDraft.description.trim(),
        quantity: Number(editDraft.quantity),
        unit_price: editDraft.unitPrice.trim(),
      });

      setEditingLineId(null);
      await onChanged();
    } catch (caught: unknown) {
      handleFailure(caught, "No fue posible guardar la línea.");
    } finally {
      setPendingLineId(null);
    }
  }

  async function handleDeleteLine(line: ServiceChargeLine): Promise<void> {
    if (!confirmWithFocusRestore(`¿Quitar la línea "${line.description}"?`)) {
      return;
    }

    setPendingLineId(line.id);
    setError(null);

    try {
      await deleteServiceChargeLine(token, line.id);
      await onChanged();
    } catch (caught: unknown) {
      handleFailure(caught, "No fue posible quitar la línea.");
    } finally {
      setPendingLineId(null);
    }
  }

  async function handleCreateType(values: ServiceTypeFormValues): Promise<void> {
    setTypeSubmitting(true);
    setTypeSubmitError(null);
    setTypeServerErrors({});

    try {
      const created = await createServiceType(token, buildServiceTypeWritePayload(values));

      setServiceTypes((current) =>
        [...current, created].sort((left, right) =>
          left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
        ),
      );

      // Queda elegido en la línea, con su precio precargado.
      setDraft((current) => ({
        ...current,
        serviceTypeId: String(created.id),
        description: created.name,
        unitPrice:
          created.default_labor_price !== null
            ? String(Number(created.default_labor_price))
            : current.unitPrice,
      }));

      setIsTypeDialogOpen(false);
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }

      if (caught instanceof ApiError && caught.status === 400) {
        setTypeServerErrors(mapServiceTypeApiFieldErrors(caught.fieldErrors));
      }

      setTypeSubmitError(errorMessage(caught, "No fue posible crear el tipo de servicio."));
    } finally {
      setTypeSubmitting(false);
    }
  }

  const hasCharges = lines.length > 0 || accessories.length > 0;

  return (
    <div className="grid gap-5">
      {error && <FormError message={error} />}

      {lines.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          {canManage
            ? "Todavía no hay líneas de cobro. Elija un tipo de servicio o escriba qué se cobra."
            : "Este servicio no tiene líneas de cobro."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] ring-1 ring-[var(--color-border-soft)]">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border-soft)] bg-surface-muted/70 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Concepto
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Cantidad
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Precio
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Importe
                </th>
                {canManage && <th className="px-4 py-3" aria-label="Acciones" />}
              </tr>
            </thead>

            <tbody>
              {lines.map((line) =>
                editingLineId === line.id ? (
                  <tr key={line.id} className="border-b border-[var(--color-border-soft)] bg-surface-muted/40 last:border-b-0">
                    <td className="px-4 py-3">
                      <Input
                        value={editDraft.description}
                        onChange={(event) => {
                          setEditDraft((current) => ({ ...current, description: event.target.value }));
                        }}
                        aria-label="Concepto"
                        maxLength={255}
                        className="h-10"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={editDraft.quantity}
                        onChange={(event) => {
                          setEditDraft((current) => ({ ...current, quantity: event.target.value }));
                        }}
                        inputMode="numeric"
                        aria-label="Cantidad"
                        className="ml-auto h-10 w-20 text-right"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={editDraft.unitPrice}
                        onChange={(event) => {
                          setEditDraft((current) => ({ ...current, unitPrice: event.target.value }));
                        }}
                        inputMode="decimal"
                        aria-label="Precio"
                        className="ml-auto h-10 w-32 text-right"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-muted-foreground">—</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditingLineId(null);
                          }}
                          disabled={pendingLineId === line.id}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            void handleSaveLine(line);
                          }}
                          isLoading={pendingLineId === line.id}
                          loadingText="Guardando…"
                        >
                          Guardar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={line.id} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">{line.description}</td>
                    <td className="px-4 py-3 text-right text-sm text-foreground">{line.quantity}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-muted-foreground">
                      ₡{formatMoney(line.unit_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-semibold text-foreground">
                      ₡{formatMoney(line.amount)}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              startEditing(line);
                            }}
                            disabled={pendingLineId !== null || editingLineId !== null}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            onClick={() => {
                              void handleDeleteLine(line);
                            }}
                            isLoading={pendingLineId === line.id}
                            loadingText="Quitando…"
                            disabled={pendingLineId !== null || editingLineId !== null}
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

      {canManage && (
        <form
          onSubmit={(event) => {
            void handleAddLine(event);
          }}
          noValidate
          className="grid gap-4 rounded-[var(--radius-lg)] bg-surface-muted/50 p-4 ring-1 ring-[var(--color-border-soft)] sm:p-5"
        >
          <p className="text-sm font-semibold text-foreground">Agregar línea de cobro</p>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_6rem_9rem]">
            <Field id="charge-line-type" label="Tipo de servicio">
              <div className="flex gap-2">
                <select
                  id="charge-line-type"
                  value={draft.serviceTypeId}
                  onChange={(event) => {
                    selectType(event.target.value);
                  }}
                  disabled={isAdding}
                  className={SELECT_CLASSES}
                >
                  <option value="">Sin tipo</option>
                  {serviceTypes.map((serviceType) => (
                    <option key={serviceType.id} value={serviceType.id}>
                      {serviceType.name}
                    </option>
                  ))}
                </select>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setTypeSubmitError(null);
                    setTypeServerErrors({});
                    setIsTypeDialogOpen(true);
                  }}
                  disabled={isAdding}
                >
                  Nuevo
                </Button>
              </div>
            </Field>

            <Field id="charge-line-description" label="Concepto">
              <Input
                id="charge-line-description"
                value={draft.description}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, description: event.target.value }));
                }}
                placeholder="Mano de obra"
                maxLength={255}
                autoComplete="off"
                disabled={isAdding}
              />
            </Field>

            <Field id="charge-line-quantity" label="Cantidad">
              <Input
                id="charge-line-quantity"
                value={draft.quantity}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, quantity: event.target.value }));
                }}
                inputMode="numeric"
                autoComplete="off"
                disabled={isAdding}
              />
            </Field>

            <Field id="charge-line-price" label="Precio">
              <Input
                id="charge-line-price"
                value={draft.unitPrice}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, unitPrice: event.target.value }));
                }}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                disabled={isAdding}
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button type="submit" isLoading={isAdding} loadingText="Agregando…">
              Agregar línea
            </Button>
          </div>
        </form>
      )}

      {hasCharges && (
        <dl className="ml-auto grid w-full max-w-sm gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Líneas de cobro</dt>
            <dd className="font-mono text-foreground">₡{formatMoney(linesTotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Accesorios</dt>
            <dd className="font-mono text-foreground">₡{formatMoney(accessoriesTotal)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-[var(--color-border-soft)] pt-2 font-semibold">
            <dt className="text-foreground">Subtotal</dt>
            <dd className="font-mono text-foreground">₡{formatMoney(subtotal ?? 0)}</dd>
          </div>
        </dl>
      )}

      <Dialog
        open={isTypeDialogOpen}
        title="Nuevo tipo de servicio"
        description="Queda en el catálogo y elegido para esta línea, con su precio de mano de obra."
        onClose={() => {
          if (!typeSubmitting) {
            setIsTypeDialogOpen(false);
          }
        }}
      >
        <ServiceTypeForm
          mode="create"
          embedded
          initialValues={EMPTY_SERVICE_TYPE_FORM_VALUES}
          isSubmitting={typeSubmitting}
          submitError={typeSubmitError}
          serverErrors={typeServerErrors}
          onSubmit={handleCreateType}
          onCancel={() => {
            setIsTypeDialogOpen(false);
          }}
        />
      </Dialog>
    </div>
  );
}
