import {
  forwardRef,
  type TextareaHTMLAttributes,
} from "react";

type TextareaProps =
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    hasError?: boolean;
  };

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(function Textarea(
  {
    hasError = false,
    className = "",
    ...props
  },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={hasError || undefined}
      className={[
        "min-h-32 w-full resize-y rounded-[var(--radius-md)] border bg-surface px-4 py-3 text-[15px] leading-6 text-foreground shadow-sm",
        "placeholder:text-[var(--color-text-subtle)]",
        "transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        "hover:border-[var(--color-border-strong)]",
        "focus:border-primary focus:outline-none focus:ring-4 focus:ring-[rgb(7_81_132_/_12%)]",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground",
        hasError
          ? "border-danger focus:border-danger focus:ring-[rgb(215_0_21_/_10%)]"
          : "border-border",
        className,
      ].join(" ")}
      {...props}
    />
  );
});