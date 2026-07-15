import { Button } from "@/components/ui/button";

type PaginationProps = Readonly<{
  page: number;
  pageSize: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
}>;

export function Pagination({
  page,
  pageSize,
  totalItems,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(
    1,
    Math.ceil(totalItems / pageSize),
  );

  const firstItem =
    totalItems === 0
      ? 0
      : (page - 1) * pageSize + 1;

  const lastItem = Math.min(
    page * pageSize,
    totalItems,
  );

  return (
    <div className="flex flex-col gap-4 border-t border-[var(--color-border-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Mostrando{" "}
        <span className="font-semibold text-foreground">
          {firstItem}
        </span>
        {" – "}
        <span className="font-semibold text-foreground">
          {lastItem}
        </span>
        {" de "}
        <span className="font-semibold text-foreground">
          {totalItems}
        </span>
      </p>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!hasPreviousPage}
          onClick={() => {
            onPageChange(page - 1);
          }}
          aria-label="Ir a la página anterior"
        >
          Anterior
        </Button>

        <span
          className="min-w-24 text-center text-sm font-medium text-muted-foreground"
          aria-live="polite"
        >
          Página {page} de {totalPages}
        </span>

        <Button
          type="button"
          variant="secondary"
          disabled={!hasNextPage}
          onClick={() => {
            onPageChange(page + 1);
          }}
          aria-label="Ir a la página siguiente"
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}