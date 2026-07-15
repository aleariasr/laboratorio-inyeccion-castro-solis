type AppLogoSize =
  | "compact"
  | "medium"
  | "large";

type AppLogoProps = {
  size?: AppLogoSize;
  align?: "left" | "center";
};

const sizeClasses: Record<
  AppLogoSize,
  {
    company: string;
    name: string;
    spacing: string;
  }
> = {
  compact: {
    company: "text-[11px] tracking-[0.18em]",
    name: "text-[14px] tracking-[0.13em]",
    spacing: "mt-1",
  },
  medium: {
    company: "text-[13px] tracking-[0.21em]",
    name: "text-[18px] tracking-[0.14em]",
    spacing: "mt-1.5",
  },
  large: {
    company:
      "text-[14px] tracking-[0.23em] sm:text-[15px]",
    name:
      "text-[22px] tracking-[0.15em] sm:text-[25px]",
    spacing: "mt-2",
  },
};

export function AppLogo({
  size = "medium",
  align = "left",
}: AppLogoProps) {
  const classes = sizeClasses[size];

  return (
    <div
      className={[
        "min-w-0 select-none",
        align === "center"
          ? "text-center"
          : "text-left",
      ].join(" ")}
      aria-label="Laboratorio de Inyección Castro Solís"
    >
      <p
        className={[
          "whitespace-nowrap font-semibold uppercase leading-none text-foreground",
          classes.company,
        ].join(" ")}
      >
        Laboratorio de Inyección
      </p>

      <p
        className={[
          "whitespace-nowrap font-semibold uppercase leading-none text-[var(--color-brand-blue)]",
          classes.name,
          classes.spacing,
        ].join(" ")}
      >
        Castro Solís
      </p>
    </div>
  );
}