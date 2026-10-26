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

// Espejo exacto del bypass de ModulePermission en el backend: solo
// superusuario o el grupo ADMIN saltan el chequeo de permiso de
// modulo. A diferencia de isAdministrativeUser, is_staff NO cuenta
// aca -- is_staff solo controla el acceso al panel /admin/ de Django
// (ver AdministrationPermission), no el de los modulos de negocio.
function isModuleAdmin(user: AuthUser): boolean {
  return user.is_superuser || user.groups.includes("ADMIN");
}

export function hasAnyRole(
  user: AuthUser,
  roles: AppRole[],
): boolean {
  if (isModuleAdmin(user)) {
    return true;
  }

  return roles.some((role) =>
    user.groups.includes(role),
  );
}

export function hasModulePermission(
  user: AuthUser,
  codename: string,
): boolean {
  return user.permissions.includes(codename);
}

// --- Inventario: productos ---

// Ventas y Clientes y servicio leen productos para buscarlos dentro de
// sus formularios (líneas de venta, accesorios de un servicio).
export function canReadProducts(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY", "SALES", "CUSTOMERS", "READ_ONLY"]) ||
    hasModulePermission(user, "view_products")
  );
}

// La pantalla de Productos en el menú es para quien tiene el módulo de
// inventario completo, no para quien solo busca productos desde una
// venta o un servicio. Mismo criterio que la tarjeta de productos bajo
// mínimo del inicio (DashboardSummaryView).
export function canOpenProductsModule(user: AuthUser): boolean {
  return canReadProducts(user) && canReadLocations(user);
}

export function canWriteProducts(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY"]) ||
    hasModulePermission(user, "add_products") ||
    hasModulePermission(user, "change_products")
  );
}

// --- Inventario: ubicaciones ---

export function canReadLocations(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY", "READ_ONLY"]) ||
    hasModulePermission(user, "view_locations")
  );
}

export function canWriteLocations(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY"]) ||
    hasModulePermission(user, "add_locations") ||
    hasModulePermission(user, "change_locations")
  );
}

// --- Inventario: proveedores ---

export function canReadSuppliers(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["READ_ONLY"]) ||
    hasModulePermission(user, "view_suppliers")
  );
}

export function canWriteSuppliers(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "add_suppliers") ||
    hasModulePermission(user, "change_suppliers")
  );
}

// --- Inventario: compras ---

export function canReadPurchases(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["READ_ONLY"]) ||
    hasModulePermission(user, "view_purchases")
  );
}

export function canWritePurchases(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "add_purchases") ||
    hasModulePermission(user, "change_purchases")
  );
}

// --- Inventario: conteos físicos ---

export function canReadInventoryCounts(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["READ_ONLY"]) ||
    hasModulePermission(user, "view_inventory_counts")
  );
}

export function canWriteInventoryCounts(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "add_inventory_counts") ||
    hasModulePermission(user, "change_inventory_counts")
  );
}

// --- Inventario: movimientos (solo lectura) ---
// Ningún rol tiene view_movements fuera de ADMIN (ver setup_roles.py):
// se entra desde Reportes. Se puede dar suelto a un usuario.

export function canReadMovements(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "view_movements")
  );
}

// --- Costos ---
// Costo de compra, histórico de costos y precio sugerido. Solo ADMIN
// o quien tenga view_costs suelto; el precio de venta no cuenta como
// costo y lo ve cualquiera que lea productos.

export function canReadCosts(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "view_costs")
  );
}

// --- Ventas ---

export function canReadSales(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["SALES", "READ_ONLY"]) ||
    hasModulePermission(user, "view_sales")
  );
}

export function canWriteSales(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["SALES"]) ||
    hasModulePermission(user, "add_sales") ||
    hasModulePermission(user, "change_sales")
  );
}

export function canCancelSales(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["SALES"]) ||
    hasModulePermission(user, "cancel_sales")
  );
}

// --- Clientes y servicio: clientes ---

// Ventas busca el cliente de una venta e Inventario el de una proforma.
export function canReadCustomers(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["INVENTORY", "SALES", "CUSTOMERS", "READ_ONLY"]) ||
    hasModulePermission(user, "view_customers")
  );
}

// La pantalla de Clientes en el menú es para quien tiene el módulo de
// clientes y servicio, no para quien solo busca un cliente desde una
// venta o una proforma. Mismo criterio que canOpenProductsModule.
export function canOpenCustomersModule(user: AuthUser): boolean {
  return canReadCustomers(user) && canReadInjectors(user);
}

export function canWriteCustomers(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS"]) ||
    hasModulePermission(user, "add_customers") ||
    hasModulePermission(user, "change_customers")
  );
}

// --- Clientes y servicio: inyectores ---

export function canReadInjectors(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS", "READ_ONLY"]) ||
    hasModulePermission(user, "view_injectors")
  );
}

export function canWriteInjectors(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS"]) ||
    hasModulePermission(user, "add_injectors") ||
    hasModulePermission(user, "change_injectors")
  );
}

// --- Clientes y servicio: servicios ---

export function canReadServices(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS", "READ_ONLY"]) ||
    hasModulePermission(user, "view_services")
  );
}

export function canWriteServices(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS"]) ||
    hasModulePermission(user, "add_services") ||
    hasModulePermission(user, "change_services")
  );
}

// Precio, tipo de servicio, método de pago y entrega: solo el
// Administrador (punto 25). Es regla de rol, no de permiso de módulo
// (ModuleAdminRequired en el backend), así que no se puede dar suelto.
export function canPriceServices(user: AuthUser): boolean {
  return isModuleAdmin(user);
}

export function canCancelServices(user: AuthUser): boolean {
  return (
    hasAnyRole(user, ["CUSTOMERS"]) ||
    hasModulePermission(user, "cancel_services")
  );
}

// --- Documentos: proformas ---
// add_documents solo controla la proforma (los demás PDF se piden con
// GET y caen en view_documents). Hace falta leer productos para
// armarla.

export function canCreateProformas(user: AuthUser): boolean {
  return (
    canReadProducts(user) &&
    (hasAnyRole(user, ["INVENTORY", "SALES"]) ||
      hasModulePermission(user, "add_documents"))
  );
}

// --- Reportes ---

export function canReadReports(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "view_reports")
  );
}

// --- Caja ---
// Por ahora solo ADMIN tiene los permisos view_cash/add_cash
// asignados (ver setup_roles.py) — igual patrón que Reportes.

export function canReadCash(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "view_cash")
  );
}

export function canWriteCash(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "add_cash")
  );
}

// --- Inventario: traslados a otra sede (punto 6 del plan del 2026-10-22) ---
// Ningún rol los tiene: solo ADMIN, o quien reciba los permisos sueltos.

export function canReadTransfers(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "view_transfers")
  );
}

export function canWriteTransfers(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "add_transfers") ||
    hasModulePermission(user, "change_transfers")
  );
}

export function canCancelTransfers(user: AuthUser): boolean {
  return (
    isModuleAdmin(user) ||
    hasModulePermission(user, "cancel_transfers")
  );
}
