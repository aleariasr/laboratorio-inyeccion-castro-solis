import type { ComponentType } from "react";

import type { AppRole } from "@/features/auth/permissions";
import type { AuthUser } from "@/features/auth/types";

export type NavigationSectionId =
  | "main"
  | "inventory"
  | "sales"
  | "customers"
  | "reports"
  | "documents"
  | "administration";

export type NavigationIconComponent = ComponentType<{
  className?: string;
}>;

export type NavigationItem = {
  href: string;
  label: string;
  section: NavigationSectionId;
  icon: NavigationIconComponent;
  roles?: AppRole[];
  permissionCheck?: (user: AuthUser) => boolean;
  adminOnly?: boolean;
};

export type NavigationSection = {
  id: NavigationSectionId;
  label: string;
};
