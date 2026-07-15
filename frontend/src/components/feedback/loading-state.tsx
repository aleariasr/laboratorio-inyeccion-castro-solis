type LoadingStateProps = {
  message?: string;
  fullScreen?: boolean;
};

export function LoadingState({
  message = "Cargando…",
  fullScreen = false,
}: LoadingStateProps) {
  return (
    <div
      className={[
        "flex items-center justify-center",
        fullScreen
          ? "min-h-screen p-6"
          : "min-h-40 p-6",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <span
          className="size-5 animate-spin rounded-full border-2 border-primary border-r-transparent"
          aria-hidden="true"
        />

        <span>{message}</span>
      </div>
    </div>
  );
}