type IconProps = Readonly<{
  className?: string;
}>;

export function HomeIcon({
  className = "size-5",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 10.4 12 3.8l8 6.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M6.3 9.4v10.2h11.4V9.4M9.6 19.6v-5.8h4.8v5.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InventoryIcon({
  className = "size-5",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4.5 7.5 12 3.8l7.5 3.7L12 11.2 4.5 7.5Z"
        strokeLinejoin="round"
      />

      <path
        d="M4.5 7.5v8.8L12 20.2l7.5-3.9V7.5M12 11.2v9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatusIcon({
  className = "size-5",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="8.4"
      />

      <path
        d="M8 12.4 10.6 15l5.7-6.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MenuIcon({
  className = "size-5",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5 7.5h14M5 12h14M5 16.5h14"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloseIcon({
  className = "size-5",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        d="m7 7 10 10M17 7 7 17"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LogoutIcon({
  className = "size-5",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M10 5.3H6.8A1.8 1.8 0 0 0 5 7.1v9.8a1.8 1.8 0 0 0 1.8 1.8H10"
        strokeLinecap="round"
      />

      <path
        d="m14.4 8.5 3.6 3.5-3.6 3.5M9.2 12H18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon({
  className = "size-5",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="10.8"
        cy="10.8"
        r="6.2"
      />

      <path
        d="m15.4 15.4 4.1 4.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BoxIcon({
  className = "size-5",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4.5 7.5 12 3.8l7.5 3.7L12 11.2 4.5 7.5Z"
        strokeLinejoin="round"
      />

      <path
        d="M4.5 7.5v8.8L12 20.2l7.5-3.9V7.5M12 11.2v9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowLeftIcon({
  className = "size-5",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        d="m14.5 6.5-5.5 5.5 5.5 5.5M9.3 12H19"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LocationIcon({
  className = "size-5",
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5 5.5h14v13H5z"
        strokeLinejoin="round"
      />

      <path
        d="M8.5 5.5v13M15.5 5.5v13M5 10h14M5 14h14"
        strokeLinecap="round"
      />
    </svg>
  );
}
