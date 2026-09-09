"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { ArrowLeftIcon } from "@/components/icons/app-icons";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { canReadCash } from "@/features/auth/permissions";
import { getCashClosing } from "@/features/cash/api";
import type { CashClosing } from "@/features/cash/types";
import { formatDate, formatMoney } from "@/features/inventory/purchases/format";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      closing: null;
      message: null;
    }
  | {
      status: "success";
      closing: CashClosing;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      closing: null;
      message: string;
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

  return "No fue posible consultar el cierre de caja.";
}

export default function CashClosingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    closing: null,
    message: null,
  });

  const closingId = Number(params.id);

  const hasCashAccess = user ? canReadCash(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasCashAccess ||
      !Number.isInteger(closingId) ||
      closingId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getCashClosing(token, closingId, controller.signal)
      .then((closing) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", closing, message: null });
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
            closing: null,
            message: "Este usuario no tiene permisos para consultar caja.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            closing: null,
            message: "El cierre de caja solicitado no existe.",
          });

          return;
        }

        setLoadState({
          status: "error",
          closing: null,
          message: getErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasCashAccess, closingId, logout, router, token]);

  function goBack(): void {
    router.back();
  }

  if (!Number.isInteger(closingId) || closingId <= 0) {
    return (
      <AppShell
        title="Cierre no válido"
        description="La dirección proporcionada no identifica un cierre de caja."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un cierre válido."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/cash");
              }}
            >
              Volver a caja
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (authStatus === "authenticated" && user && !hasCashAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Este módulo requiere permisos de caja."
      >
        <StatePanel
          title="No tiene acceso a caja"
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
        loadState.status === "success"
          ? `Cierre ${loadState.closing.week_start} — ${loadState.closing.week_end}`
          : "Detalle de cierre"
      }
      description="Los cierres de caja no se pueden editar ni eliminar una vez creados."
      actions={
        <Button type="button" variant="secondary" onClick={goBack}>
          <ArrowLeftIcon />
          Volver
        </Button>
      }
    >
      {loadState.status === "loading" && <LoadingState message="Consultando cierre…" />}

      {loadState.status === "forbidden" && (
        <StatePanel title="Acceso restringido" message={loadState.message} tone="warning" />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Cierre no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/cash");
              }}
            >
              Volver al listado
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el cierre"
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
        <div className="app-status-card overflow-hidden">
          <div className="grid gap-6 p-6 sm:grid-cols-3">
            <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
              <p className="text-sm text-muted-foreground">Efectivo esperado</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
                ₡{formatMoney(loadState.closing.expected_cash_total)}
              </p>
            </div>

            <div className="rounded-[var(--radius-lg)] bg-surface-muted p-4">
              <p className="text-sm text-muted-foreground">Efectivo contado</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
                ₡{formatMoney(loadState.closing.counted_cash_total)}
              </p>
            </div>

            <div
              className={[
                "rounded-[var(--radius-lg)] p-4",
                Number(loadState.closing.difference) === 0
                  ? "bg-[var(--color-success-soft)]"
                  : "bg-[var(--color-danger-soft)]",
              ].join(" ")}
            >
              <p className="text-sm text-muted-foreground">Diferencia</p>
              <p
                className={[
                  "mt-2 font-mono text-2xl font-semibold",
                  Number(loadState.closing.difference) === 0
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-danger)]",
                ].join(" ")}
              >
                ₡{formatMoney(loadState.closing.difference)}
              </p>
            </div>
          </div>

          <dl className="border-t border-[var(--color-border-soft)]">
            <div className="app-status-row">
              <dt>Semana</dt>
              <dd>
                {loadState.closing.week_start} — {loadState.closing.week_end}
              </dd>
            </div>

            {loadState.closing.difference_reason && (
              <div className="app-status-row">
                <dt>Motivo de la diferencia</dt>
                <dd>{loadState.closing.difference_reason}</dd>
              </div>
            )}

            {loadState.closing.notes && (
              <div className="app-status-row">
                <dt>Notas</dt>
                <dd>{loadState.closing.notes}</dd>
              </div>
            )}

            <div className="app-status-row">
              <dt>Cerrado el</dt>
              <dd>{formatDate(loadState.closing.created_at)}</dd>
            </div>
          </dl>
        </div>
      )}
    </AppShell>
  );
}
