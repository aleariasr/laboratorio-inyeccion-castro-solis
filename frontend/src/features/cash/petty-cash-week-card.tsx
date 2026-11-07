"use client";

import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/feedback/form-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateOnly, formatMoney } from "@/features/inventory/purchases/format";
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

function signedMoney(value: number): string {
  return `${value < 0 ? "−" : ""}₡${formatMoney(Math.abs(value))}`;
}

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
 * Caja de la semana en curso (puntos 21 + 22 y sobregiro del
 * 2026-11-07): fondo de caja chica + ingresos en efectivo − gastos =
 * efectivo en caja, la lista de gastos y el formulario para registrar
 * uno. Los gastos salen primero del fondo; lo que lo supera sale de los
 * ingresos (sobregiro). Los de semanas cerradas no se tocan (backend).
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

  const preview = loadState.status === "success" ? loadState.preview : null;
  const movements = loadState.status === "success" ? loadState.movements : [];

  // null la primera vez: el fondo todavía no se definió en ningún cierre.
  const opening =
    preview?.petty_cash_opening !== null && preview?.petty_cash_opening !== undefined
      ? Number(preview.petty_cash_opening)
      : null;

  const outflows = Number(preview?.petty_cash_outflows ?? 0);

  // Solo el efectivo puede pagar un gasto: tarjeta y transferencia no
  // están en billetes en la caja.
  const cashIncome = Number(preview?.expected_cash ?? 0);

  const otherCollected = preview
    ? Number(preview.expected_card) +
      Number(preview.expected_transfer) +
      Number(preview.expected_other)
    : 0;

  const cashInBox = preview ? (opening ?? 0) + cashIncome - outflows : null;

  const fundLeft = Number(preview?.petty_cash_fund_balance ?? 0);

  const overdraft = Number(preview?.petty_cash_overdraft ?? 0);

  // Aviso en vivo al escribir el monto: cuánto sale del fondo y cuánto de
  // los ingresos (sobregiro).
  const typedAmount =
    DECIMAL_PATTERN.test(amount.trim()) && Number(amount) > 0 ? Number(amount) : null;

  const typedOverdraft =
    preview && typedAmount !== null ? Math.max(typedAmount - fundLeft, 0) : 0;

  const typedExceedsCash =
    cashInBox !== null && typedAmount !== null && typedAmount > cashInBox;

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
      nextErrors.reason = "El motivo del gasto es obligatorio.";
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || isSubmitting) {
      return;
    }

    // No se bloquea (puede haber ventas en efectivo sin registrar), pero
    // se pide confirmar un gasto mayor que el efectivo que hay en la caja.
    if (
      cashInBox !== null &&
      Number(amount) > cashInBox &&
      !confirmWithFocusRestore(
        `Este gasto supera el efectivo que el sistema calcula en la caja (${signedMoney(cashInBox)}). ¿Registrarlo igual?`,
      )
    ) {
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
        error instanceof ApiError ? error.message : "No fue posible registrar el gasto.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(movement: PettyCashMovement): Promise<void> {
    if (
      !confirmWithFocusRestore(
        `¿Borrar el gasto "${movement.reason}" de ₡${formatMoney(movement.amount)}?`,
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
        error instanceof ApiError ? error.message : "No fue posible borrar el gasto.",
      );
    } finally {
      setPendingDeleteId(null);
    }
  }

  const tiles = [
    {
      label: "Fondo de caja chica",
      value: opening !== null ? `₡${formatMoney(opening)}` : "—",
      note: preview && opening === null ? "Se define en el primer cierre." : null,
    },
    {
      label: "Ingresos en efectivo",
      value: `+ ₡${formatMoney(cashIncome)}`,
      note: "Ventas y servicios cobrados hasta hoy.",
    },
    {
      label: "Gastos",
      value: `− ₡${formatMoney(outflows)}`,
      note: null,
    },
  ];

  return (
    <section className="app-status-card mb-6 overflow-hidden">
      <div className="border-b border-[var(--color-border-soft)] p-5 sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
          Caja de esta semana
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          {preview
            ? `Semana del ${formatWeekRange(preview.week_start, preview.week_end)}. `
            : ""}
          Los gastos salen primero del fondo; si no alcanza, de los ingresos en efectivo de la semana.
        </p>
      </div>

      {loadState.status === "error" ? (
        <p className="p-5 text-sm text-[var(--color-danger)] sm:p-6">
          {loadState.message}
        </p>
      ) : (
        <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="grid content-start gap-5">
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {tiles.map((tile) => (
                <div
                  key={tile.label}
                  className="rounded-[var(--radius-lg)] bg-surface-muted p-4"
                >
                  <p className="text-sm text-muted-foreground">{tile.label}</p>
                  <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
                    {preview ? tile.value : "—"}
                  </p>
                  {tile.note && (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {tile.note}
                    </p>
                  )}
                </div>
              ))}

              <div
                className={[
                  "rounded-[var(--radius-lg)] p-4",
                  cashInBox !== null && cashInBox < 0
                    ? "bg-[var(--color-danger-soft)]"
                    : "bg-[var(--color-primary-soft)]",
                ].join(" ")}
              >
                <p className="text-sm font-medium text-foreground">Efectivo en caja</p>
                <p className="mt-1.5 font-mono text-xl font-semibold text-foreground">
                  {cashInBox !== null ? signedMoney(cashInBox) : "—"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Fondo + ingresos en efectivo − gastos.
                </p>
              </div>
            </div>

            {preview && otherCollected > 0 && (
              <p className="text-sm text-muted-foreground">
                Cobrado con tarjeta, transferencia u otro:{" "}
                <span className="font-mono font-semibold text-foreground">
                  ₡{formatMoney(otherCollected)}
                </span>{" "}
                (no está en efectivo).
              </p>
            )}

            {overdraft > 0 && (
              <p className="rounded-[var(--radius-lg)] bg-[var(--color-warning-soft)] px-4 py-3 text-sm text-[var(--color-warning)]">
                <span className="font-semibold">Sobregiro:</span>{" "}
                <span className="font-mono font-semibold">₡{formatMoney(overdraft)}</span>{" "}
                de los gastos se pagaron con los ingresos de la semana. El fondo se repone al
                cerrar la semana.
              </p>
            )}

            {cashInBox !== null && cashInBox < 0 && (
              <p className="rounded-[var(--radius-lg)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
                Los gastos superan el efectivo registrado: puede faltar registrar ventas, o la
                plata salió de otro lado. Al cerrar la semana se verá como diferencia.
              </p>
            )}

            {movements.length === 0 ? (
              <p className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                {loadState.status === "loading"
                  ? "Cargando gastos…"
                  : "Todavía no hay gastos esta semana."}
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
                        {formatDateOnly(movement.date)}
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
                Registrar gasto
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

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
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

              {typedAmount !== null && typedExceedsCash ? (
                <p className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] px-3 py-2 text-xs leading-5 text-[var(--color-danger)]">
                  Supera el efectivo que el sistema calcula en la caja (
                  <span className="font-mono">{signedMoney(cashInBox ?? 0)}</span>). Se pedirá
                  confirmar.
                </p>
              ) : typedOverdraft > 0 ? (
                <p className="rounded-[var(--radius-md)] bg-[var(--color-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--color-warning)]">
                  <span className="font-mono">₡{formatMoney((typedAmount ?? 0) - typedOverdraft)}</span>{" "}
                  salen del fondo y{" "}
                  <span className="font-mono">₡{formatMoney(typedOverdraft)}</span> de los
                  ingresos de la semana (sobregiro).
                </p>
              ) : null}

              <Button type="submit" isLoading={isSubmitting} loadingText="Registrando…">
                Registrar gasto
              </Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
