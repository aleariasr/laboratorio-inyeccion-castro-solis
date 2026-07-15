import type { ReactNode } from "react";

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function Field({
  id,
  label,
  required = false,
  hint,
  error,
  children,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label
          htmlFor={id}
          className="text-sm font-semibold text-foreground"
        >
          {label}
          {required ? (
            <span
              className="ml-1 text-danger"
              aria-hidden="true"
            >
              *
            </span>
          ) : null}
        </label>
      </div>

      {children}

      {hint ? (
        <p
          id={hintId}
          className="mt-2 text-xs text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          className="mt-2 text-sm font-medium text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}