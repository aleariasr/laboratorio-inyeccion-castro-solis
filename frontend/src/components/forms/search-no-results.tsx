"use client";

type SearchNoResultsProps = {
  query: string;
  /** "cliente", "proveedor", "producto"… Sin él no se ofrece crear. */
  entityLabel?: string;
  onCreate?: () => void;
};

/**
 * "Sin resultados" de un buscador con lista desplegable (punto 7 del plan
 * del 2026-10-22). Si se puede crear, ofrece crear lo que se buscó justo
 * ahí, donde la persona se da cuenta de que no existe; la ventana abre
 * con lo escrito ya cargado.
 */
export function SearchNoResults({ query, entityLabel, onCreate }: SearchNoResultsProps) {
  const trimmedQuery = query.trim();

  if (!onCreate || !entityLabel) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados.</p>;
  }

  return (
    <div>
      <p className="px-4 pt-3 pb-1 text-sm text-muted-foreground">
        No hay ningún {entityLabel} con «{trimmedQuery}».
      </p>

      <button
        type="button"
        // onMouseDown (no onClick): el buscador cierra la lista al perder
        // el foco, antes de que llegue el clic.
        onMouseDown={(event) => {
          event.preventDefault();
          onCreate();
        }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-primary hover:bg-[var(--color-primary-soft)]"
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        Crear {entityLabel} «{trimmedQuery}»
      </button>
    </div>
  );
}
