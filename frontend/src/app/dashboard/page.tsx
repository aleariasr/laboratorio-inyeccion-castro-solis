"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AppLogo } from "@/components/branding/app-logo";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";

export default function DashboardPage() {
  const router = useRouter();
  const {
    status,
    user,
    logout,
  } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  async function handleLogout(): Promise<void> {
    await logout();
    router.replace("/login");
  }

  if (status !== "authenticated" || !user) {
    return (
      <LoadingState
        fullScreen
        message="Preparando el sistema…"
      />
    );
  }

  const displayName = [
    user.first_name,
    user.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="min-h-screen bg-background px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <AppLogo />

          <div className="flex items-center gap-4">
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-medium text-foreground">
                {displayName || user.username}
              </p>

              <p className="text-xs text-muted-foreground">
                Sesión activa
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void handleLogout();
              }}
            >
              Cerrar sesión
            </Button>
          </div>
        </header>

        <section className="py-10">
          <p className="text-sm font-medium text-[var(--color-brand-blue)]">
            Inicio
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
            ¿Qué necesita hacer?
          </h1>

          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            Seleccione una opción para comenzar.
          </p>
        </section>

        <section
          aria-label="Opciones principales"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              Inventario
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Consultar productos, ubicaciones y existencias.
            </p>
          </article>

          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              Ventas
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Registrar y consultar ventas.
            </p>
          </article>

          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              Clientes e inyectores
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Consultar clientes y trabajos realizados.
            </p>
          </article>

          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              Compras
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Consultar proveedores, compras y costos.
            </p>
          </article>

          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              Reportes
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Revisar información operativa del negocio.
            </p>
          </article>

          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              Administración
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Usuarios, configuración y estado técnico.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}