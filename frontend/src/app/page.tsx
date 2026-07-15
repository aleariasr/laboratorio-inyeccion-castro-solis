export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-[var(--radius-lg)] border border-border bg-surface p-8 shadow-sm">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Laboratorio de Inyección Castro Solís
        </p>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Sistema LICS
        </h1>

        <p className="mt-3 max-w-md text-muted-foreground">
          La base técnica del frontend está lista para comenzar la
          autenticación y la estructura operativa.
        </p>

        <div
          className="mt-6 rounded-[var(--radius-md)] border border-border bg-surface-muted px-4 py-3"
          role="status"
        >
          <strong className="font-medium">
            Frontend en preparación
          </strong>

          <p className="mt-1 text-sm text-muted-foreground">
            Próximo bloque: cliente API, manejo de errores y acceso al
            sistema.
          </p>
        </div>
      </section>
    </main>
  );
}
