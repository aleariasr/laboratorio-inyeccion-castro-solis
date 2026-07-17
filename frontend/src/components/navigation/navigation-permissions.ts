import {
  hasAnyRole,
  isAdministrativeUser,
} from "@/features/auth/permissions";
import type { AuthUser } from "@/features/auth/types";

import type { NavigationItem } from "./navigation-types";

export function canAccessNavigationItem(
  user: AuthUser,
  item: NavigationItem,
): boolean {
  if (item.adminOnly) {
    return isAdministrativeUser(user);
  }

  if (!item.roles || item.roles.length === 0) {
    return true;
  }

  return hasAnyRole(user, item.roles);
}