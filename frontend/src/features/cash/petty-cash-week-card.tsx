"use client";

import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/features/inventory/purchases/format";
import { ApiError } from "@/lib/api/errors";
import { confirmWithFocusRestore } from "@/lib/dom/confirm-with-focus-restore";

import {
  createPettyCashMovement,
  deletePettyCashMovement,
  getCashClosingPreview,
  getPettyCashMovements,
} from "./api";
import { formatWeekRange } from "./format";
import type { CashClosingPreview, PettyCashMovement } from "./types";

type PettyCashWeekCardProps = {
  token: string;
  canWrite: boolean;
  onUnauthorized: () => void;
};

type LoadState =
  | { status: "loading" }
  | {
      status: "success";
      preview: CashClosingPreview;
      movements: PettyCashMovement[];
    }
  | { status: "error"; message: string };

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Sábado en que empieza la semana de caja de hoy (sábado a viernes). */
function currentWeekStart(): string {
  const today = new Date();
  // getDay(): domingo=0 ... sábado=6
  const daysSinceSaturday = (today.getDay() + 1) % 7;
  today.setDate(today.getDate() - daysSinceSaturday);

  return toDateOnly(today);
}

/**
 * Caja chica de la semana en curso (puntos 21 + 22): fondo, salidas y
 * saldo, la lista de salidas y el formulario para registrar una. Las
 * salidas de semanas ya cerradas no se tocan (lo valida el backend).
 */
export function PettyCashWeekCard({
  token,
  canWrite,
  onUnauthorized,
}: PettyCashWeekCardProps) {
  const [weekStart] = useState(currentWeekStart);

  const [reloadKey, setReloadKey] = useState(0);

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const [date, setDate] = useState(() => toDateOnly(new Date()));

  const [amount, setAmount] = useState("");

  const [reason, setReason] = useState("");

  const [fieldErrors, setFieldErrors] = useState<{
    date?: string;
    amount?: string;
    reason?: string;
  }>({});

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      getCashClosingPreview(token, weekStart, controller.signal),
      getPettyCashMovements(token, weekStart, controller.signal),
    ])
      .then(([preview, movements]) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", preview, movements });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized();
          return;
        }

        setLoadState({
          status: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "No fue posible cargar la caja chica.",
        });
      });

    return () => {
      controller.abort();
    };
  }, [onUnauthorized, reloadKey, token, weekStart]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const nextErrors: typeof fieldErrors = {};

    if (!date) {
      nextErrors.date = "La fecha es obligatoria.";
    }

    if (!DECIMAL_PATTERN.test(amount.trim()) || Number(amount) <= 0) {
      nextErrors.amount = "El monto debe ser mayor que cero.";
    }

    if (!reason.trim()) {
      nextErrors.reason = "El motivo de la salida es obligatorio.";
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createPettyCashMovement(token, {
        date,
        amount: amount.trim(),
        reason: reason.trim(),
      });

      setAmount("");
      setReason("");
      setReloadKey((current) => current + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        setFieldErrors({
          date: error.fieldErrors.date?.[0],
          amount: error.fieldErrors.amount?.[0],
          reason: error.fieldErrors.reason?.[0],
        });

        if (
          !error.fieldErrors.date &&
          !error.fieldErrors.amount &&
          !error.fieldErrors.reason
        ) {
          setSubmitError(error.message);
        }

        return;
      }

      setSubmitError(
        error instanceof ApiError ? error.message : "No fue posible registrar la salida.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(movement: PettyCashMovement): Promise<void> {
    if (
      !confirmWithFocusRestore(
        `¿Borrar la salida "${movement.reason}" de ₡${formatMoney(movement.amount)}?`,
      )
    ) {
      return;
    }

    setPendingDeleteId(movement.id);
    setSubmitError(null);

    try {
      await deletePettyCashMovement(token, movement.id);
      setReloadKey((current) => current + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }

      setSubmitError(
        error instanceof ApiError ? error.message : "No fue posible borrar la salida.",
      );
    } finally {
      setPendingDeleteId(null);
    }
  }

  const preview = loadState.status === "success" ? loadState.preview : null;
  const movements = loadState.status === "success" ? loadState.movements : [];

  const opening =
    preview?.petty_cash_opening !== null && preview?.petty_cash_opening !== undefined
      ? Number(preview.petty_cash_opening)
      : null;

  const outflows = Number(preview?.petty_cash_outflows ?? 0);

  const balance = opening !== null ? opening - outflows : null;

  return (
    <section className="app-status-card mb-6 overflow-hidden">
      <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
          Caja chica de esta semana
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          {preview
            ? `Semana del ${formatWeekRange(preview.week_start, preview.week_end)}. `
            : ""}
          Gastos pagados con el fondo. Al cerrar la semana se cuentan junto con el resto de la caja.
        </p>
      </div>

      {loadState.status === "error" ? (
        <p className="p-5 text-sm text-[var(--color-danger)] sm:p-6">
          {loadState.message}
        </p>
      ) : (
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="grid content-start gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
                <p className="text-sm text-muted-foreground">Fondo</p>
                <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
                  {opening !== null ? `₡${formatMoney(opening)}` : "—"}
                </p>
                {preview && opening === null && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Se define en el primer cierre.
                  </p>
                )}
              </div>

              <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
                <p className="text-sm text-muted-foreground">Salidas</p>
                <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
                  − ₡{formatMoney(outflows)}
                </p>
              </div>

              <div
                className={[
                  "rounded-[var(--radius-lg)] p-4",
                  balance !== null && balance < 0
                    ? "bg-[var(--color-danger-soft)]"
                    : "bg-[var(--color-primary-soft)]",
                ].join(" ")}
              >
                <p className="text-sm text-muted-foreground">Saldo</p>
                <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
                  {balance !== null
                    ? `${balance < 0 ? "−" : ""}₡${formatMoney(Math.abs(balance))}`
                    : "—"}
                </p>
              </div>
            </div>

            {movements.length === 0 ? (
              <p className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                {loadState.status === "loading"
                  ? "Cargando salidas…"
                  : "Todavía no hay salidas esta semana."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border-soft)] rounded-[var(--radius-lg)] ring-1 ring-[var(--color-border-soft)]">
                {movements.map((movement) => (
                  <li
                    key={movement.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {movement.reason}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(movement.date)}
                        {movement.created_by_name
                          ? ` · ${movement.created_by_name}`
                          : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        ₡{formatMoney(movement.amount)}
                      </span>

                      {canWrite && (
                        <Button
                          type="button"
                          variant="ghost"
                          isLoading={pendingDeleteId === movement.id}
                          loadingText="Borrando…"
                          onClick={() => {
                            void handleDelete(movement);
                          }}
                          disabled={pendingDeleteId !== null}
                        >
                          Borrar
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canWrite && (
            <form
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
              noValidate
              className="grid content-start gap-4 rounded-[var(--radius-lg)] bg-surface-muted/50 p-5 ring-1 ring-[var(--color-border-soft)]"
            >
              <p className="text-sm font-semibold text-foreground">
                Registrar salida
              </p>

              {submitError && <FormError message={submitError} />}

              <Field id="petty-cash-reason" label="Motivo" error={fieldErrors.reason}>
                <Input
                  id="petty-cash-reason"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                  }}
                  hasError={Boolean(fieldErrors.reason)}
                  maxLength={255}
                  placeholder="Café, papel, mensajería…"
                  disabled={isSubmitting}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Field id="petty-cash-amount" label="Monto" error={fieldErrors.amount}>
                  <Input
                    id="petty-cash-amount"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                    }}
                    hasError={Boolean(fieldErrors.amount)}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    disabled={isSubmitting}
                  />
                </Field>

                <Field id="petty-cash-date" label="Fecha" error={fieldErrors.date}>
                  <Input
                    id="petty-cash-date"
                    type="date"
                    value={date}
                    max={toDateOnly(new Date())}
                    onChange={(event) => {
                      setDate(event.target.value);
                    }}
                    hasError={Boolean(fieldErrors.date)}
                    disabled={isSubmitting}
                  />
                </Field>
              </div>

              <Button type="submit" isLoading={isSubmitting} loadingText="Registrando…">
                Registrar salida
              </Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
