import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost";

type ButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    isLoading?: boolean;
    loadingText?: string;
    children: ReactNode;
  };

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white shadow-sm hover:bg-primary-hover active:bg-[var(--color-primary-active)]",
  secondary:
    "border border-border bg-surface text-foreground shadow-sm hover:bg-surface-muted",
  danger:
    "bg-danger text-white shadow-sm hover:bg-[var(--color-danger-hover)]",
  ghost:
    "bg-transparent text-foreground hover:bg-surface-muted",
};

export function Button({
  variant = "primary",
  isLoading = false,
  loadingText = "Procesando…",
  disabled,
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading}
      className={[
        "motion-scale inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-semibold",
        "disabled:cursor-not-allowed disabled:opacity-55",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {isLoading ? (
        <>
          <span
            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            aria-hidden="true"
          />
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}