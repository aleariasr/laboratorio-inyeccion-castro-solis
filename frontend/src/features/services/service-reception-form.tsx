"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { CREATE_OPTION_VALUE } from "@/components/forms/create-option";
import { Field } from "@/components/forms/field";
import { formActionsClassName, formSectionClassName } from "@/components/forms/form-layout";
import { SearchNoResults } from "@/components/forms/search-no-results";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";
import { getCustomerInjectors } from "@/features/customers/api";
import { CreateCustomerDialog } from "@/features/customers/create-customer-dialog";
import type { CustomerInjector } from "@/features/customers/types";
import { CreateInjectorDialog } from "@/features/injectors/create-injector-dialog";
import { searchCustomers } from "@/features/sales/api";
import type { CustomerSummary } from "@/features/sales/types";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";
import { isFormShortcutTarget } from "@/lib/dom/form-shortcuts";

import { getServiceRecords, getServiceTypes } from "./api";
import { CreateServiceTypeDialog } from "./create-service-type-dialog";
import type {
  ServiceRecord,
  ServiceReceptionFormErrors,
  ServiceReceptionFormValues,
  ServiceReceptionItemValues,
  ServiceTypeDetail,
} from "./types";
import { validateServiceReceptionForm } from "./validation";

const SELECT_CLASSES =
  "h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 text-[15px] text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)] disabled:cursor-not-allowed disabled:bg-surface-muted";

// Estados de un servicio abierto (ni entregado ni anulado).
const OPEN_STATUS_LABELS: Partial<Record<ServiceRecord["status"], string>> = {
  RECEIVED: "Recibido",
  IN_PROGRESS: "En proceso",
  READY: "Listo",
};

type InjectorsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; injectors: CustomerInjector[] }
  | { status: "error"; message: string };

type ServiceReceptionFormProps = {
  token: string;
  initialValues: ServiceReceptionFormValues;
  canReadCustomers: boolean;
  canCreateCustomers: boolean;
  canCreateInjectors: boolean;
  /** El tipo de servicio lo elige solo el Administrador (punto 25). */
  canChooseServiceType: boolean;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ServiceReceptionFormErrors;
  onSubmit: (values: ServiceReceptionFormValues) => void | Promise<void>;
  onCancel: () => void;
};

/**
 * Recepción del servicio (punto 1C del plan del 2026-10-22): el cliente
 * (buscar o crear), uno o varios de sus inyectores (marcar o crear), lo que
 * reporta el cliente de cada uno, la fecha y, para el Administrador, el
 * tipo de servicio. Se crea un servicio por inyector. El cobro, los
 * accesorios y los datos técnicos siguen en el detalle de cada servicio.
 */
export function ServiceReceptionForm({
  token,
  initialValues,
  canReadCustomers,
  canCreateCustomers,
  canCreateInjectors,
  canChooseServiceType,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
  onCancel,
}: ServiceReceptionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<ServiceReceptionFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<ServiceReceptionFormErrors>({});

  const [customerQuery, setCustomerQuery] = useState("");

  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);

  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);

  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);

  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);

  // Lo escrito al abrir la ventana: abre como nombre del cliente.
  const [customerDialogName, setCustomerDialogName] = useState("");

  const [injectorsState, setInjectorsState] = useState<InjectorsState>({ status: "idle" });

  const [isInjectorDialogOpen, setIsInjectorDialogOpen] = useState(false);

  // Servicios abiertos del cliente, por inyector: se avisa en la fila para
  // no recibir dos veces el mismo inyector sin darse cuenta.
  const [openServicesByInjector, setOpenServicesByInjector] = useState<
    Map<number, ServiceRecord>
  >(new Map());

  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDetail[]>([]);

  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);

  const errors = { ...serverErrors, ...localErrors };

  const isDirty =
    values.customer !== null ||
    values.serviceTypeId !== initialValues.serviceTypeId ||
    values.receivedAt !== initialValues.receivedAt;

  const effectiveCustomerSearchError = canReadCustomers
    ? customerSearchError
    : "No tiene permiso para buscar clientes.";

  // Búsqueda de clientes, como en ventas.
  useEffect(() => {
    if (!canReadCustomers) {
      return;
    }

    const trimmedQuery = customerQuery.trim();

    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = globalThis.setTimeout(() => {
      searchCustomers(token, trimmedQuery, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setCustomerResults(results);
            setCustomerSearchError(null);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setCustomerSearchError("No fue posible buscar clientes.");
          }
        });
    }, 350);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [canReadCustomers, customerQuery, token]);

  // Inyectores del cliente elegido.
  const customerId = values.customer?.id ?? null;

  useEffect(() => {
    if (customerId === null) {
      return;
    }

    const controller = new AbortController();

    getServiceRecords(
      token,
      {
        query: "",
        customerId,
        status: "",
        activeState: "active",
        receivedFrom: "",
        receivedTo: "",
        page: 1,
        pageSize: 100,
      },
      controller.signal,
    )
      .then((response) => {
        if (!controller.signal.aborted) {
          setOpenServicesByInjector(
            new Map(
              // La lista viene de la más reciente a la más vieja: se recorre
              // al revés para que quede la más reciente de cada inyector.
              response.results
                .filter((record) => OPEN_STATUS_LABELS[record.status] !== undefined)
                .reverse()
                .map((record) => [record.injector, record]),
            ),
          );
        }
      })
      .catch(() => undefined);

    getCustomerInjectors(token, customerId, controller.signal)
      .then((injectors) => {
        if (!controller.signal.aborted) {
          setInjectorsState({
            status: "success",
            injectors: injectors.filter((injector) => injector.is_active),
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setInjectorsState({
            status: "error",
            message: "No fue posible consultar los inyectores del cliente.",
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [customerId, token]);

  // Tipos de servicio activos (solo el Administrador los elige).
  useEffect(() => {
    if (!canChooseServiceType) {
      return;
    }

    const controller = new AbortController();

    getServiceTypes(token, "", controller.signal)
      .then((types) => {
        if (!controller.signal.aborted) {
          setServiceTypes(types);
        }
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
    };
  }, [canChooseServiceType, token]);

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();

        if (!isSubmitting && isFormShortcutTarget(formRef.current)) {
          formRef.current?.requestSubmit();
        }
      }
    }

    globalThis.addEventListener("keydown", handleSaveShortcut);

    return () => {
      globalThis.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [isSubmitting]);

  function clearError(field: keyof ServiceReceptionFormErrors): void {
    setLocalErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  function selectCustomer(customer: { id: number; label: string }): void {
    setValues((current) => ({ ...current, customer, items: [] }));
    setInjectorsState({ status: "loading" });
    setCustomerQuery("");
    setCustomerResults([]);
    setIsCustomerListOpen(false);
    clearError("customer");
  }

  function clearCustomer(): void {
    setValues((current) => ({ ...current, customer: null, items: [] }));
    setInjectorsState({ status: "idle" });
    setOpenServicesByInjector(new Map());
  }

  function toggleInjector(injector: CustomerInjector): void {
    setValues((current) => ({
      ...current,
      items: current.items.some((item) => item.injectorId === injector.id)
        ? current.items.filter((item) => item.injectorId !== injector.id)
        : [
            ...current.items,
            {
              injectorId: injector.id,
              injectorNumber: injector.injector_number,
              description: injector.description,
              notesBefore: "",
            },
          ],
    }));
    clearError("items");
  }

  function updateNotes(injectorId: number, notesBefore: string): void {
    setValues((current) => ({
      ...current,
      items: current.items.map((item: ServiceReceptionItemValues) =>
        item.injectorId === injectorId ? { ...item, notesBefore } : item,
      ),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateServiceReceptionForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    void onSubmit(values);
  }

  function handleCancel(): void {
    if (
      isDirty &&
      !confirmWithFocusRestore("Hay cambios sin guardar. ¿Desea salir y descartarlos?")
    ) {
      return;
    }

    onCancel();
  }

  const injectorCount = values.items.length;

  const submitLabel =
    injectorCount > 1 ? `Recibir ${injectorCount} inyectores` : "Recibir inyector";

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-6">
        {submitError && <FormError message={submitError} />}

        {/* Sin overflow-hidden: cortaría la lista de resultados del buscador. */}
        <section className={formSectionClassName(false).replace("overflow-hidden ", "")}>
          <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Cliente e inyectores
            </h2>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Se crea un servicio por cada inyector marcado, todos con la misma fecha.
            </p>
          </div>

          <div className="grid gap-6 p-5 sm:p-6">
            <Field
              id="reception-customer"
              label="Cliente"
              required
              hint={
                values.customer
                  ? undefined
                  : `Búsqueda por nombre, identificación o teléfono.${canCreateCustomers ? " Si no existe, se crea desde la lista." : ""}`
              }
              error={errors.customer}
            >
              {values.customer ? (
                <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-2.5">
                  <span className="text-sm font-medium text-foreground">
                    {values.customer.label}
                  </span>

                  <button
                    type="button"
                    onClick={clearCustomer}
                    className="text-xs font-semibold text-primary hover:underline"
                    disabled={isSubmitting}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    id="reception-customer"
                    value={customerQuery}
                    onChange={(event) => {
                      const nextValue = event.target.value;

                      setCustomerQuery(nextValue);
                      setIsCustomerListOpen(true);

                      if (nextValue.trim().length < 2) {
                        setCustomerResults([]);
                        setCustomerSearchError(null);
                      }
                    }}
                    onFocus={() => {
                      setIsCustomerListOpen(true);
                    }}
                    onBlur={() => {
                      globalThis.setTimeout(() => {
                        setIsCustomerListOpen(false);
                      }, 150);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                      }
                    }}
                    hasError={Boolean(errors.customer)}
                    placeholder="Nombre, identificación o teléfono"
                    autoComplete="off"
                    autoFocus
                    disabled={isSubmitting}
                  />

                  {isCustomerListOpen && customerQuery.trim().length >= 2 && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-md)]">
                      {effectiveCustomerSearchError && (
                        <p className="px-4 py-3 text-sm text-[var(--color-danger)]">
                          {effectiveCustomerSearchError}
                        </p>
                      )}

                      {!effectiveCustomerSearchError && customerResults.length === 0 && (
                        <SearchNoResults
                          query={customerQuery}
                          entityLabel="cliente"
                          onCreate={
                            canCreateCustomers
                              ? () => {
                                  setCustomerDialogName(customerQuery);
                                  setIsCustomerDialogOpen(true);
                                }
                              : undefined
                          }
                        />
                      )}

                      {!effectiveCustomerSearchError && customerResults.length > 0 && (
                        <ul className="max-h-64 overflow-y-auto">
                          {customerResults.map((customer) => (
                            <li key={customer.id}>
                              <button
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  selectCustomer({ id: customer.id, label: customer.display_name });
                                }}
                                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                              >
                                <span className="font-semibold text-foreground">
                                  {customer.display_name}
                                </span>

                                {customer.phone && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {customer.phone}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Field>

            {values.customer && (
              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">
                  Inyectores que se reciben
                  <span className="ml-1 text-danger" aria-hidden="true">
                    *
                  </span>
                </p>

                <div className="overflow-hidden rounded-[var(--radius-lg)] ring-1 ring-[var(--color-border-soft)]">
                  {injectorsState.status === "loading" && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      Consultando inyectores…
                    </p>
                  )}

                  {injectorsState.status === "error" && (
                    <p className="px-4 py-3 text-sm text-[var(--color-danger)]">
                      {injectorsState.message}
                    </p>
                  )}

                  {injectorsState.status === "success" &&
                    injectorsState.injectors.length === 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">
                        Este cliente todavía no tiene inyectores registrados.
                      </p>
                    )}

                  {injectorsState.status === "success" &&
                    injectorsState.injectors.map((injector) => {
                      const item = values.items.find(
                        (current) => current.injectorId === injector.id,
                      );

                      const openService = openServicesByInjector.get(injector.id);

                      return (
                        <div
                          key={injector.id}
                          className={[
                            "border-b border-[var(--color-border-soft)] last:border-b-0",
                            item ? "bg-[var(--color-primary-soft)]" : "bg-surface",
                          ].join(" ")}
                        >
                          <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                            <input
                              type="checkbox"
                              checked={Boolean(item)}
                              onChange={() => {
                                toggleInjector(injector);
                              }}
                              disabled={isSubmitting}
                              className="size-4 cursor-pointer accent-[var(--color-primary)]"
                            />

                            <span className="font-mono text-sm font-semibold text-foreground">
                              {injector.injector_number}
                            </span>

                            {injector.description && (
                              <span className="text-sm text-muted-foreground">
                                {injector.description}
                              </span>
                            )}
                          </label>

                          {openService && (
                            <p className="-mt-1 px-4 pb-3 pl-11 text-xs font-medium text-[var(--color-warning)]">
                              {`Tiene un servicio abierto: #${openService.id} · ${OPEN_STATUS_LABELS[openService.status]}.`}
                            </p>
                          )}

                          {item && (
                            <div className="px-4 pb-3 pl-11">
                              <Input
                                value={item.notesBefore}
                                onChange={(event) => {
                                  updateNotes(injector.id, event.target.value);
                                }}
                                placeholder="Lo que reporta el cliente (opcional)"
                                aria-label={`Lo que reporta el cliente de ${injector.injector_number}`}
                                autoComplete="off"
                                className="h-10"
                                disabled={isSubmitting}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {canCreateInjectors && injectorsState.status === "success" && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsInjectorDialogOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="flex w-full items-center gap-2 border-t border-[var(--color-border-soft)] bg-surface px-4 py-3 text-left text-sm font-semibold text-primary hover:bg-[var(--color-primary-soft)]"
                    >
                      <span aria-hidden="true" className="text-base leading-none">
                        +
                      </span>
                      Nuevo inyector de {values.customer.label}
                    </button>
                  )}
                </div>

                {errors.items && (
                  <p className="mt-2 text-sm font-medium text-danger" role="alert">
                    {errors.items}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className={formSectionClassName(false)}>
          <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              Recepción
            </h2>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              El cobro, los accesorios y los datos técnicos se registran después, en el detalle de
              cada servicio.
            </p>
          </div>

          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
            <Field
              id="reception-received-at"
              label="Fecha y hora de recepción"
              required
              error={errors.receivedAt}
            >
              <Input
                id="reception-received-at"
                type="datetime-local"
                value={values.receivedAt}
                onChange={(event) => {
                  const receivedAt = event.target.value;

                  setValues((current) => ({ ...current, receivedAt }));
                  clearError("receivedAt");
                }}
                hasError={Boolean(errors.receivedAt)}
                disabled={isSubmitting}
              />
            </Field>

            {canChooseServiceType && (
              <Field
                id="reception-service-type"
                label="Tipo de servicio"
                hint="Opcional. Se puede elegir después, al cobrar."
                error={errors.serviceTypeId}
              >
                <select
                  id="reception-service-type"
                  value={values.serviceTypeId}
                  onChange={(event) => {
                    if (event.target.value === CREATE_OPTION_VALUE) {
                      setIsTypeDialogOpen(true);
                      return;
                    }

                    const serviceTypeId = event.target.value;

                    setValues((current) => ({ ...current, serviceTypeId }));
                  }}
                  disabled={isSubmitting}
                  className={SELECT_CLASSES}
                >
                  <option value="">Sin tipo</option>
                  {serviceTypes.map((serviceType) => (
                    <option key={serviceType.id} value={serviceType.id}>
                      {serviceType.name}
                    </option>
                  ))}
                  <option value={CREATE_OPTION_VALUE}>+ Nuevo tipo de servicio…</option>
                </select>
              </Field>
            )}
          </div>
        </section>

        <div className={formActionsClassName(false)}>
          <div className="text-xs text-muted-foreground">
            {injectorCount === 0
              ? "Ningún inyector marcado."
              : `${injectorCount} ${injectorCount === 1 ? "inyector marcado" : "inyectores marcados"}.`}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSubmitting}>
              Cancelar
            </Button>

            <Button type="submit" isLoading={isSubmitting} loadingText="Recibiendo…">
              <span>{submitLabel}</span>

              {!isSubmitting && <KeyboardShortcut keys={["Ctrl", "S"]} />}
            </Button>
          </div>
        </div>
      </form>

      {canCreateCustomers && (
        <CreateCustomerDialog
          open={isCustomerDialogOpen}
          token={token}
          purpose="esta recepción"
          initialName={customerDialogName}
          onClose={() => {
            setIsCustomerDialogOpen(false);
          }}
          onCreated={(customer) => {
            selectCustomer({ id: customer.id, label: customer.display_name });
            setIsCustomerDialogOpen(false);
          }}
        />
      )}

      {canCreateInjectors && values.customer && (
        <CreateInjectorDialog
          open={isInjectorDialogOpen}
          token={token}
          customer={values.customer}
          onClose={() => {
            setIsInjectorDialogOpen(false);
          }}
          onCreated={(injector) => {
            const created: CustomerInjector = {
              id: injector.id,
              injector_number: injector.injector_number,
              description: injector.description,
              is_active: injector.is_active,
            };

            // Queda en la lista del cliente y marcado.
            setInjectorsState((current) =>
              current.status === "success"
                ? { status: "success", injectors: [...current.injectors, created] }
                : current,
            );
            toggleInjector(created);
            setIsInjectorDialogOpen(false);
          }}
        />
      )}

      {canChooseServiceType && (
        <CreateServiceTypeDialog
          open={isTypeDialogOpen}
          token={token}
          purpose="esta recepción"
          onClose={() => {
            setIsTypeDialogOpen(false);
          }}
          onCreated={(serviceType) => {
            setServiceTypes((current) =>
              [...current, serviceType].sort((left, right) =>
                left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
              ),
            );
            setValues((current) => ({ ...current, serviceTypeId: String(serviceType.id) }));
            setIsTypeDialogOpen(false);
          }}
        />
      )}
    </>
  );
}
