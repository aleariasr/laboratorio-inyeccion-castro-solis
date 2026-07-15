type KeyboardShortcutProps = {
  keys: string[];
};

export function KeyboardShortcut({
  keys,
}: KeyboardShortcutProps) {
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label={`Atajo: ${keys.join(" más ")}`}
    >
      {keys.map((key) => (
        <kbd
          key={key}
          className="min-w-6 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-center font-mono text-[11px] font-medium text-muted-foreground shadow-sm"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}