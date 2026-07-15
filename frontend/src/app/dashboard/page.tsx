"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
      <main className="flex min-h-screen items-center justify-center p-6">
        <p
          className="text-sm text-muted-foreground"
          aria-live="polite"
        >
          Verificando acceso…
        </p>
      </main>
    );
  }

  const fullName = [
    user.first_name,
    user.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="min-h-screen p-6">
      <section className="mx-auto max-w-5xl rounded-[var(--radius-lg)] border border-border bg-surface p-8 shadow-sm">
        <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Sistema LICS
            </p>

            <h1 className="mt-2 text-2xl font-semibold">
              Panel principal
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Sesión iniciada como{" "}
              <strong className="font-medium text-foreground">
                {fullName || user.username}
              </strong>
              .
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleLogout();
            }}
            className="h-10 rounded-[var(--radius-md)] border border-border px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
          >
            Cerrar sesión
          </button>
        </header>

        <div
          className="mt-6 rounded-[var(--radius-md)] border border-border bg-surface-muted p-5"
          role="status"
        >
          <h2 className="font-medium">
            Autenticación funcionando
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            Esta pantalla será reemplazada posteriormente por la
            estructura operativa, navegación y estado del sistema.
          </p>
        </div>
      </section>
    </main>
  );
}