type AppLogoProps = {
  compact?: boolean;
  align?: "left" | "center";
};

export function AppLogo({
  compact = false,
  align = "left",
}: AppLogoProps) {
  return (
    <div
      className={[
        "min-w-0",
        align === "center"
          ? "text-center"
          : "text-left",
      ].join(" ")}
    >
      <p
        className={[
          "font-semibold uppercase text-foreground",
          compact
            ? "text-[11px] tracking-[0.18em]"
            : "text-[12px] tracking-[0.22em]",
        ].join(" ")}
      >
        Laboratorio de Inyección
      </p>

      <p
        className={[
          "mt-1 font-semibold uppercase text-[var(--color-brand-blue)]",
          compact
            ? "text-[13px] tracking-[0.12em]"
            : "text-[15px] tracking-[0.14em]",
        ].join(" ")}
      >
        Castro Solís
      </p>
    </div>
  );
}