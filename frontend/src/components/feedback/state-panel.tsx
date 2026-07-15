import type { ReactNode } from "react";

type StatePanelTone =
  | "neutral"
  | "warning"
  | "error";

type StatePanelProps = Readonly<{
  title: string;
  message: string;
  tone?: StatePanelTone;
  icon?: ReactNode;
  action?: ReactNode;
}>;

const toneClasses: Record<
  StatePanelTone,
  string
> = {
  neutral:
    "bg-surface text-foreground ring-[var(--color-border-soft)]",
  warning:
    "bg-[var(--color-warning-soft)] text-[var(--color-warning)] ring-[rgb(160_90_0_/_16%)]",
  error:
    "bg-[var(--color-danger-soft)] text-danger ring-[rgb(215_0_21_/_16%)]",
};

export function StatePanel({
  title,
  message,
  tone = "neutral",
  icon,
  action,
}: StatePanelProps) {
  return (
    <section
      className={[
        "motion-fade rounded-[var(--radius-xl)] p-7 shadow-[var(--shadow-sm)] ring-1",
        toneClasses[tone],
      ].join(" ")}
      role={
        tone === "error"
          ? "alert"
          : "status"
      }
    >
      <div className="flex items-start gap-4">
        {icon && (
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-white/65"
            aria-hidden="true"
          >
            {icon}
          </div>
        )}

        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">
            {title}
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {message}
          </p>

          {action && (
            <div className="mt-6">
              {action}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}