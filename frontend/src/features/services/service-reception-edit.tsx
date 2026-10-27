"use client";

import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCustomerInjectors } from "@/features/customers/api";
import type { CustomerInjector } from "@/features/customers/types";
import { ApiError } from "@/lib/api/errors";

import { updateServiceRecordReception } from "./api";
import type { ServiceRecord } from "./types";

const SELECT_CLASSES =
  "h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 text-[15px] text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)] disabled:cursor-not-allowed disabled:bg-surface-muted";

/** Fecha y hora ISO a la hora local, como la pide un input datetime-local. */
function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

type ServiceReceptionEditProps = {
  token: string;
  serviceRecord: ServiceRecord;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
  onUnauthorized: () => void;
};

/**
 * Corregir la recepción de un servicio (punto 1C del plan del 2026-10-22):
 * la fecha y hora, y el inyector entre los del mismo cliente (un error de
 * recepción típico es marcar el inyector equivocado del mismo vehículo).
 * Solo mientras el servicio no esté entregado ni anulado.
 */
export function ServiceReceptionEdit({
  token,
  serviceRecord,
  onSaved,
  onCancel,
  onUnauthorized,
}: ServiceReceptionEditProps) {
  const [injectorId, setInjectorId] = useState(String(serviceRecord.injector));

  const [receivedAt, setReceivedAt] = useState(() => toDateTimeLocal(serviceRecord.received_at));

  const [injectors, setInjectors] = useState<CustomerInjector[] | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const customerId = serviceRecord.injector_detail.customer;

  useEffect(() => {
    const controller = new AbortController();

    getCustomerInjectors(token, customerId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setInjectors(
            result.filter(
              (injector) => injector.is_active || injector.id === serviceRecord.injector,
            ),
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("No fue posible consultar los inyectores del cliente.");
        }
      });

    return () => {
      controller.abort();
    };
  }, [customerId, serviceRecord.injector, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!receivedAt) {
      setError("La fecha de recepción es obligatoria.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updateServiceRecordReception(token, serviceRecord.id, {
        injector: Number(injectorId),
        received_at: new Date(receivedAt).toISOString(),
      });
      await onSaved();
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }

      setError(caught instanceof ApiError ? caught.message : "No fue posible guardar la recepción.");
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      noValidate
      className="grid gap-5 border-t border-[var(--color-border-soft)] bg-surface-muted/40 p-6"
    >
      <p className="text-sm font-semibold text-foreground">Corregir recepción</p>

      {error && <FormError message={error} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <Field id="reception-edit-injector" label="Inyector">
          <select
            id="reception-edit-injector"
            value={injectorId}
            onChange={(event) => {
              setInjectorId(event.target.value);
            }}
            disabled={isSubmitting || injectors === null}
            className={SELECT_CLASSES}
          >
            {injectors === null ? (
              <option value={injectorId}>{serviceRecord.injector_detail.injector_number}</option>
            ) : (
              injectors.map((injector) => (
                <option key={injector.id} value={injector.id}>
                  {injector.injector_number}
                  {injector.description ? ` — ${injector.description}` : ""}
                </option>
              ))
            )}
          </select>
        </Field>

        <Field id="reception-edit-received-at" label="Fecha y hora de recepción" required>
          <Input
            id="reception-edit-received-at"
            type="datetime-local"
            value={receivedAt}
            onChange={(event) => {
              setReceivedAt(event.target.value);
            }}
            disabled={isSubmitting}
          />
        </Field>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>

        <Button type="submit" isLoading={isSubmitting} loadingText="Guardando…">
          Guardar recepción
        </Button>
      </div>
    </form>
  );
}
