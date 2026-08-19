import type { AuthUser } from "./types";

export type AppRole =
  | "ADMIN"
  | "INVENTORY"
  | "SALES"
  | "CUSTOMERS"
  | "READ_ONLY";

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

export function canReadInventory(
  user: AuthUser,
): boolean {
  return hasAnyRole(user, [
    "INVENTORY",
    "READ_ONLY",
  ]);
}

export function canWriteInventory(
  user: AuthUser,
): boolean {
  return hasAnyRole(user, [
    "INVENTORY",
  ]);
}

export function canReadSales(
  user: AuthUser,
): boolean {
  return hasAnyRole(user, [
    "SALES",
    "READ_ONLY",
  ]);
}

export function canWriteSales(
  user: AuthUser,
): boolean {
  return hasAnyRole(user, [
    "SALES",
  ]);
}

export function canReadCustomers(user: AuthUser): boolean {
  return hasAnyRole(user, ["CUSTOMERS", "READ_ONLY"]);
}

export function canWriteCustomers(user: AuthUser): boolean {
  return hasAnyRole(user, ["CUSTOMERS"]);
}

export function canReadReports(user: AuthUser): boolean {
  return hasAnyRole(user, [
    "INVENTORY",
    "SALES",
    "READ_ONLY",
  ]);
}
