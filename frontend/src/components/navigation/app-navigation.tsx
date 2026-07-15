import Link from "next/link";

import type { AuthUser } from "@/features/auth/types";

import {
  NAVIGATION_ITEMS,
  NAVIGATION_SECTIONS,
} from "./navigation-config";
import { canAccessNavigationItem } from "./navigation-permissions";

type AppNavigationProps = Readonly<{
  pathname: string;
  user: AuthUser;
  onNavigate?: () => void;
}>;

function isNavigationItemActive(
  pathname: string,
  href: string,
): boolean {
  if (pathname === href) {
    return true;
  }

  if (href === "/dashboard") {
    return false;
  }

  return pathname.startsWith(`${href}/`);
}

export function AppNavigation({
  pathname,
  user,
  onNavigate,
}: AppNavigationProps) {
  const visibleItems = NAVIGATION_ITEMS.filter(
    (item) =>
      canAccessNavigationItem(user, item),
  );

  return (
    <nav aria-label="Navegación principal">
      <div className="space-y-8">
        {NAVIGATION_SECTIONS.map((section) => {
          const sectionItems = visibleItems.filter(
            (item) =>
              item.section === section.id,
          );

          if (sectionItems.length === 0) {
            return null;
          }

          return (
            <section key={section.id}>
              <p className="app-nav-section-label">
                {section.label}
              </p>

              <div className="mt-2 space-y-1">
                {sectionItems.map((item) => {
                  const isActive =
                    isNavigationItemActive(
                      pathname,
                      item.href,
                    );

                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={
                        isActive
                          ? "page"
                          : undefined
                      }
                      onClick={onNavigate}
                      className={[
                        "app-nav-item group",
                        isActive
                          ? "app-nav-item-active"
                          : "text-muted-foreground",
                      ].join(" ")}
                    >
                      <span className="app-nav-icon">
                        <Icon />
                      </span>

                      <span className="truncate">
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </nav>
  );
}