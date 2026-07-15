import type { AuthUser } from "@/features/auth/types";

import type {
  AppRole,
  NavigationItem,
} from "./navigation-types";

export function isAdministrativeUser(
  user: AuthUser,
): boolean {
  return (
    user.is_superuser ||
    user.is_staff ||
    user.groups.includes("ADMIN")
  );
}

export function hasAnyRole(
  user: AuthUser,
  roles: AppRole[],
): boolean {
  if (isAdministrativeUser(user)) {
    return true;
  }

  return roles.some((role) =>
    user.groups.includes(role),
  );
}

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