"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/features/inventory/purchases/format";

import { createServiceType, getLatestServiceTypePriceHistory, getServiceTypes } from "./api";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
  type ServicePriceFormErrors,
  type ServicePriceFormField,
  type ServicePriceFormValues,
  type ServiceType,
  type ServiceTypePriceHistory,
} from "./types";
import { validateServicePriceForm } from "./validation";

type ServicePriceFormProps = {
  initialValues: ServicePriceFormValues;
  canReadServiceTypes: boolean;
  canWriteServiceTypes: boolean;
  accessoriesTotal: number;
  token: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  serverErrors?: ServicePriceFormErrors;
  onSubmit: (values: ServicePriceFormValues) => void | Promise<void>;
};

function mergeErrors(
  localErrors: ServicePriceFormErrors,
  serverErrors: ServicePriceFormErrors,
): ServicePriceFormErrors {
  return {
    ...serverErrors,
    ...localErrors,
  };
}

export function ServicePriceForm({
  initialValues,
  canReadServiceTypes,
  canWriteServiceTypes,
  accessoriesTotal,
  token,
  isSubmitting = false,
  submitError = null,
  serverErrors = {},
  onSubmit,
}: ServicePriceFormProps) {
  const [values, setValues] = useState<ServicePriceFormValues>(initialValues);

  const [localErrors, setLocalErrors] = useState<ServicePriceFormErrors>({});

  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);

  const [serviceTypesError, setServiceTypesError] = useState<string | null>(null);

  const [isNewServiceTypeOpen, setIsNewServiceTypeOpen] = useState(false);

  const [newServiceTypeName, setNewServiceTypeName] = useState("");

  const [newServiceTypeError, setNewServiceTypeError] = useState<string | null>(null);

  const [isCreatingServiceType, setIsCreatingServiceType] = useState(false);

  const [priceReference, setPriceReference] = useState<ServiceTypePriceHistory | null>(null);

  const errors = mergeErrors(localErrors, serverErrors);

  const effectiveServiceTypesError = canReadServiceTypes
    ? serviceTypesError
    : "No tiene permiso para consultar tipos de servicio.";

  useEffect(() => {
    if (!canReadServiceTypes) {
      return;
    }

    const controller = new AbortController();

    getServiceTypes(token, "", controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        setServiceTypes(result);
        setServiceTypesError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setServiceTypesError("No fue posible cargar los tipos de servicio.");
      });

    return () => {
      controller.abort();
    };
  }, [canReadServiceTypes, token]);

  useEffect(() => {
    if (!values.serviceTypeId || !canReadServiceTypes) {
      return;
    }

    const controller = new AbortController();

    getLatestServiceTypePriceHistory(token, Number(values.serviceTypeId), controller.signal)
      .then((history) => {
        if (controller.signal.aborted) {
          return;
        }

        setPriceReference(history);
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        setPriceReference(null);
      });

    return () => {
      controller.abort();
    };
  }, [values.serviceTypeId, canReadServiceTypes, token]);

  function updateValue(field: ServicePriceFormField, value: string): void {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));

    setLocalErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };

      delete nextErrors[field];

      return nextErrors;
    });
  }

  function handlePriceChange(event: ChangeEvent<HTMLInputElement>): void {
    updateValue("price", event.target.value);
  }

  async function handleCreateServiceType(): Promise<void> {
    if (!canWriteServiceTypes) {
      setNewServiceTypeError("No tiene permiso para crear tipos de servicio.");
      return;
    }

    const trimmedName = newServiceTypeName.trim();

    if (!trimmedName) {
      setNewServiceTypeError("El nombre del tipo de servicio es obligatorio.");
      return;
    }

    setIsCreatingServiceType(true);
    setNewServiceTypeError(null);

    try {
      const serviceType = await createServiceType(token, {
        name: trimmedName,
        description: "",
      });

      setServiceTypes((current) =>
        [...current, serviceType].sort((left, right) =>
          left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
        ),
      );

      updateValue("serviceTypeId", String(serviceType.id));
      setNewServiceTypeName("");
      setIsNewServiceTypeOpen(false);
    } catch (error: unknown) {
      setNewServiceTypeError(
        error instanceof Error ? error.message : "No fue posible crear el tipo de servicio.",
      );
    } finally {
      setIsCreatingServiceType(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const validationErrors = validateServicePriceForm(values);

    setLocalErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    void onSubmit(values);
  }

  const serviceTypePrice =
    priceReference && String(priceReference.service_type) === values.serviceTypeId
      ? Number(priceReference.price)
      : null;

  const hasSuggestion = serviceTypePrice !== null || accessoriesTotal > 0;

  const suggestedTotal = (serviceTypePrice ?? 0) + accessoriesTotal;

  const priceHint = (() => {
    if (!hasSuggestion) {
      return "Precio cobrado por este servicio. Se escribe directamente, no se calcula automáticamente.";
    }

    const parts: string[] = [];

    if (serviceTypePrice !== null) {
      parts.push(
        `₡${formatMoney(serviceTypePrice)} del tipo de servicio (cobrado el ${priceReference!.charged_at.slice(0, 10)})`,
      );
    }

    if (accessoriesTotal > 0) {
      parts.push(`₡${formatMoney(accessoriesTotal)} en accesorios usados`);
    }

    return `Sugerido: ₡${formatMoney(suggestedTotal)} (${parts.join(" + ")}). Puede escribir un precio distinto.`;
  })();

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {submitError && <FormError message={submitError} />}

      <Field id="service-type" label="Tipo de servicio" error={errors.serviceTypeId}>
        <div className="flex gap-2">
          <select
            id="service-type"
            value={values.serviceTypeId}
            onChange={(event) => {
              updateValue("serviceTypeId", event.target.value);
            }}
            disabled={isSubmitting}
            className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
          >
            <option value="">Sin tipo de servicio</option>
            {serviceTypes.map((serviceType) => (
              <option key={serviceType.id} value={serviceType.id}>
                {serviceType.name}
              </option>
            ))}
          </select>

          {canWriteServiceTypes && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsNewServiceTypeOpen((current) => !current);
                setNewServiceTypeError(null);
              }}
              disabled={isSubmitting}
            >
              Nuevo
            </Button>
          )}
        </div>

        {effectiveServiceTypesError && <p className="mt-2 text-sm text-danger">{effectiveServiceTypesError}</p>}
      </Field>

      {isNewServiceTypeOpen && (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-3">
          {newServiceTypeError && <p className="mb-2 text-sm text-danger">{newServiceTypeError}</p>}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label
                htmlFor="new-service-type"
                className="mb-1 block text-xs font-semibold text-foreground"
              >
                Nombre del nuevo tipo de servicio
              </label>

              <Input
                id="new-service-type"
                value={newServiceTypeName}
                onChange={(event) => {
                  setNewServiceTypeName(event.target.value);
                }}
                maxLength={150}
                disabled={isCreatingServiceType}
              />
            </div>

            <Button
              type="button"
              isLoading={isCreatingServiceType}
              loadingText="Creando…"
              onClick={() => {
                void handleCreateServiceType();
              }}
            >
              Crear
            </Button>
          </div>
        </div>
      )}

      <Field
        id="service-price"
        label="Precio"
        hint={priceHint}
        error={errors.price}
      >
        <div className="flex gap-2">
          <Input
            id="service-price"
            value={values.price}
            onChange={handlePriceChange}
            hasError={Boolean(errors.price)}
            inputMode="decimal"
            autoComplete="off"
            disabled={isSubmitting}
          />

          {hasSuggestion && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                updateValue("price", suggestedTotal.toFixed(4));
              }}
              disabled={isSubmitting}
            >
              Usar sugerido
            </Button>
          )}
        </div>
      </Field>

      <Field
        id="service-payment-method"
        label="Método de pago"
        required
        error={errors.paymentMethod}
      >
        <select
          id="service-payment-method"
          value={values.paymentMethod}
          onChange={(event) => {
            updateValue(
              "paymentMethod",
              event.target.value as PaymentMethod,
            );
          }}
          disabled={isSubmitting}
          className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]"
        >
          {PAYMENT_METHOD_OPTIONS.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex justify-end border-t border-[var(--color-border-soft)] pt-5">
        <Button type="submit" isLoading={isSubmitting} loadingText="Guardando…">
          Guardar precio
        </Button>
      </div>
    </form>
  );
}
