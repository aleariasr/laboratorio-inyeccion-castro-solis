"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

import { AppLogo } from "@/components/branding/app-logo";
import { LoadingState } from "@/components/feedback/loading-state";
import { useAuth } from "@/features/auth/auth-context";

type AppShellProps = Readonly<{
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}>;

type NavigationSection =
  | "main"
  | "administration";

type NavigationItem = {
  href: string;
  label: string;
  section: NavigationSection;
  administrative?: boolean;
};

const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    section: "main",
  },
  {
    href: "/system/status",
    label: "Estado del sistema",
    section: "administration",
    administrative: true,
  },
];

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="size-5"
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

function StatusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="size-5"
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

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="size-5"
      aria-hidden="true"
    >
      <path
        d="M5 7.5h14M5 12h14M5 16.5h14"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="size-5"
      aria-hidden="true"
    >
      <path
        d="m7 7 10 10M17 7 7 17"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="size-5"
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

function NavigationIcon({
  href,
}: Readonly<{
  href: string;
}>) {
  if (href === "/system/status") {
    return <StatusIcon />;
  }

  return <HomeIcon />;
}

function getInitials(
  firstName: string,
  lastName: string,
  username: string,
): string {
  const initials = [
    firstName.trim().charAt(0),
    lastName.trim().charAt(0),
  ]
    .filter(Boolean)
    .join("");

  return (
    initials ||
    username.slice(0, 2)
  ).toUpperCase();
}

export function AppShell({
  title,
  description,
  children,
  actions,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [isMobileMenuOpen, setIsMobileMenuOpen] =
    useState(false);

  const {
    status,
    user,
    logout,
  } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent): void {
      if (
        event.key === "Escape" &&
        isMobileMenuOpen
      ) {
        setIsMobileMenuOpen(false);
      }
    }

    globalThis.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      globalThis.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [isMobileMenuOpen]);

  if (
    status !== "authenticated" ||
    !user
  ) {
    return (
      <LoadingState
        fullScreen
        message="Preparando el sistema…"
      />
    );
  }

  const authenticatedUser = user;

  const fullName = [
    authenticatedUser.first_name,
    authenticatedUser.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  const visibleName =
    fullName ||
    authenticatedUser.username;

  const initials = getInitials(
    authenticatedUser.first_name,
    authenticatedUser.last_name,
    authenticatedUser.username,
  );

  const hasAdministrativeAccess =
    authenticatedUser.is_superuser ||
    authenticatedUser.is_staff ||
    authenticatedUser.groups.includes(
      "ADMIN",
    );

  const visibleItems =
    NAVIGATION_ITEMS.filter(
      (item) =>
        !item.administrative ||
        hasAdministrativeAccess,
    );

  const mainItems = visibleItems.filter(
    (item) => item.section === "main",
  );

  const administrationItems =
    visibleItems.filter(
      (item) =>
        item.section ===
        "administration",
    );

  async function handleLogout(): Promise<void> {
    await logout();
    router.replace("/login");
  }

  function renderNavigationItems(
    items: NavigationItem[],
  ) {
    return items.map((item) => {
      const isActive =
        pathname === item.href ||
        (
          item.href !== "/dashboard" &&
          pathname.startsWith(
            `${item.href}/`,
          )
        );

      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={
            isActive
              ? "page"
              : undefined
          }
          onClick={() => {
            setIsMobileMenuOpen(false);
          }}
          className={[
            "app-nav-item group",
            isActive
              ? "app-nav-item-active"
              : "text-muted-foreground",
          ].join(" ")}
        >
          <span className="app-nav-icon">
            <NavigationIcon
              href={item.href}
            />
          </span>

          <span className="truncate">
            {item.label}
          </span>
        </Link>
      );
    });
  }

  function renderNavigation() {
    return (
      <nav aria-label="Navegación principal">
        <div>
          <p className="app-nav-section-label">
            Principal
          </p>

          <div className="mt-2 space-y-1">
            {renderNavigationItems(
              mainItems,
            )}
          </div>
        </div>

        {administrationItems.length >
          0 && (
          <div className="mt-8">
            <p className="app-nav-section-label">
              Administración
            </p>

            <div className="mt-2 space-y-1">
              {renderNavigationItems(
                administrationItems,
              )}
            </div>
          </div>
        )}
      </nav>
    );
  }

  function renderAccount() {
    return (
      <div className="border-t border-[var(--color-border-soft)] pt-4">
        <div className="flex items-center gap-3 px-2">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-semibold text-[var(--color-brand-blue)]"
            aria-hidden="true"
          >
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {visibleName}
            </p>

            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {authenticatedUser.username}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            void handleLogout();
          }}
          className="app-logout-button"
        >
          <span className="flex size-7 items-center justify-center">
            <LogoutIcon />
          </span>

          <span>Cerrar sesión</span>
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header
        className="app-topbar"
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(0, 1fr) auto minmax(0, 1fr)",
        }}
      >
        <div className="flex items-center justify-start">
          <button
                type="button"
                aria-label="Abrir menú"
                aria-expanded={isMobileMenuOpen}
                onClick={() => {
                    setIsMobileMenuOpen(true);
                }}
                className="app-icon-button app-mobile-menu-button"
            >
                <MenuIcon />
            </button>
        </div>

        <div className="flex min-w-0 justify-center px-3">
          <AppLogo
            size="medium"
            align="center"
          />
        </div>

        <div
            className="flex size-10 justify-end"
            aria-hidden="true"
        />
      </header>

      <aside className="app-sidebar hidden md:flex">
        <div className="flex min-h-0 flex-1 flex-col px-4 py-6">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {renderNavigation()}
          </div>

          {renderAccount()}
        </div>
      </aside>

      <div
        className={[
          "fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] md:hidden",
          "transition-opacity duration-300 ease-out",
          isMobileMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        ].join(" ")}
        aria-hidden={
          !isMobileMenuOpen
        }
        onClick={() => {
          setIsMobileMenuOpen(false);
        }}
      />

      <aside
        aria-label="Menú móvil"
        aria-hidden={
          !isMobileMenuOpen
        }
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-[min(88vw,320px)] flex-col bg-surface shadow-[var(--shadow-lg)] md:hidden",
          "transition-transform duration-300 ease-[var(--ease-emphasized)]",
          isMobileMenuOpen
            ? "translate-x-0"
            : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex min-h-[88px] items-center justify-between border-b border-[var(--color-border-soft)] px-5">
          <AppLogo size="compact" />

          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => {
              setIsMobileMenuOpen(false);
            }}
            className="app-icon-button"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-6">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {renderNavigation()}
          </div>

          {renderAccount()}
        </div>
      </aside>

      <div className="min-h-screen pt-[88px] md:pl-[280px]">
        <main className="px-5 pb-14 pt-8 sm:px-8 sm:pt-10 xl:px-12">
          <div className="mx-auto max-w-7xl">
            <header className="app-page-header">
              <div className="min-w-0">
                <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground sm:text-[42px]">
                  {title}
                </h1>

                {description && (
                  <p className="mt-3 max-w-2xl text-[15px] leading-6 text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>

              {actions && (
                <div className="shrink-0">
                  {actions}
                </div>
              )}
            </header>

            <div
              key={pathname}
              className="page-transition mt-9"
            >
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}