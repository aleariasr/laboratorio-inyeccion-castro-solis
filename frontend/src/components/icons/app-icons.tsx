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

export function TruckIcon({
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
        d="M3.5 7h10v9h-10z"
        strokeLinejoin="round"
      />

      <path
        d="M13.5 10.5h3.6l3.4 3v2.5h-2M13.5 16h-8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="7" cy="17.3" r="1.7" />
      <circle cx="16.5" cy="17.3" r="1.7" />
    </svg>
  );
}

export function ReceiptIcon({
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
        d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6-2.4-1.6V3.5Z"
        strokeLinejoin="round"
      />

      <path
        d="M9 8h6M9 11.5h6M9 15h4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CartIcon({
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
        d="M3.5 4.5h2.1l1 12.4a2 2 0 0 0 2 1.85h8.3a2 2 0 0 0 2-1.7l1.1-7.3H6.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="10" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  );
}

export function UsersIcon({
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
      <circle cx="9" cy="8" r="3.2" />

      <path
        d="M3.8 19.2c.6-3.2 2.9-5 5.2-5s4.6 1.8 5.2 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M15.2 6a3.2 3.2 0 0 1 0 6.2M17.5 14.4c2 .5 3.6 2.1 4.1 4.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DropletIcon({
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
        d="M12 3.5c3 4 6 7.7 6 11.2A6 6 0 0 1 6 14.7c0-3.5 3-7.2 6-11.2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M9.3 16.3a2.8 2.8 0 0 0 2.7 2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WrenchIcon({
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
        d="M14.7 6.3a4 4 0 0 0-5.4 4.9L4 16.5l2.5 2.5 5.3-5.3a4 4 0 0 0 4.9-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClipboardCheckIcon({
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
        d="M8.5 4.5h7v2.4h-7z"
        strokeLinejoin="round"
      />

      <path
        d="M8.5 5.7H6.3A1.8 1.8 0 0 0 4.5 7.5v11.2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8V7.5a1.8 1.8 0 0 0-1.8-1.8h-2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M8.7 13.4 11 15.7l4.5-5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowsUpDownIcon({
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
        d="M7 4.5v15M7 4.5 3.5 8M7 4.5 10.5 8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M17 19.5v-15M17 19.5 13.5 16M17 19.5 20.5 16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LayersIcon({
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
        d="M12 4.5 4 9l8 4.5L20 9z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="m4 13 8 4.5L20 13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="m4 17 8 4.5L20 17"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ReportsIcon({
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
        d="M5 19V5M5 19h14"
        strokeLinecap="round"
      />

      <path
        d="m8 15 3-3 2.5 2 4.5-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AlertIcon({
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
        d="M12 4.5 21 19H3L12 4.5Z"
        strokeLinejoin="round"
      />

      <path
        d="M12 10v4.2"
        strokeLinecap="round"
      />

      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function KeyIcon({
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
      <circle cx="8.5" cy="8.5" r="4" />

      <path
        d="M11.5 11.5 20 20M15.5 16l2-2M18 18.5l2-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PrinterIcon({
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
        d="M7 8.5V4h10v4.5"
        strokeLinejoin="round"
      />

      <path
        d="M7 17H5.5A1.5 1.5 0 0 1 4 15.5V10a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 10v5.5a1.5 1.5 0 0 1-1.5 1.5H17"
        strokeLinejoin="round"
      />

      <path
        d="M7 13.5h10V20H7z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DownloadIcon({
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
        d="M12 4.5v10m0 0-4-4m4 4 4-4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M5 15.5v2A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SpreadsheetIcon({
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
        d="M5.5 4.5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z"
        strokeLinejoin="round"
      />

      <path
        d="M4.5 9.5h15M4.5 14.5h15M10 9.5v10"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TrendingIcon({
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
        d="m4 16.5 5-5 3.5 3.5L20 7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M14.5 7.5H20V13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
