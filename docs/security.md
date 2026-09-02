# Seguridad

## Principios

- mínimo privilegio;
- separación entre usuario operador y usuario técnico;
- secretos fuera del repositorio;
- acceso remoto restringido;
- servicios internos no expuestos;
- registro de acciones administrativas;
- backups protegidos.

## Secretos

Nunca deben confirmarse en Git:

- contraseñas;
- claves de Django;
- credenciales de PostgreSQL;
- claves SSH privadas;
- archivos `.env`;
- respaldos con información real.

## Red

Solamente Nginx debe publicar un puerto hacia el anfitrión.

PostgreSQL, Django y Next.js deben permanecer dentro de la red interna de Docker.

## Control de acceso por roles (RBAC)

El modelo de autorización actual es central para la seguridad de la aplicación y se implementa en
`backend/src/apps/core/permissions.py`, reflejado en el frontend por
`frontend/src/features/auth/permissions.ts`.

### Roles fijos

Existen 5 roles fijos, implementados como grupos de Django (ver
`backend/src/apps/core/management/commands/setup_roles.py`):

- `ADMIN`
- `INVENTORY`
- `SALES`
- `CUSTOMERS`
- `READ_ONLY`

`ADMIN` recibe todos los permisos de módulo existentes y además tiene bypass de código en
`ModulePermission` (junto con los superusuarios). El resto de los roles reciben únicamente los
permisos de módulo (`view_<módulo>` / `add_<módulo>` / `change_<módulo>` / `cancel_<módulo>`)
listados explícitamente en `ROLE_PERMISSIONS` para cada uno (por ejemplo, `INVENTORY` cubre
productos, ubicaciones, proveedores, compras, conteos de inventario, movimientos y documentos;
`SALES` cubre ventas; `CUSTOMERS` cubre clientes, inyectores y servicios; `READ_ONLY` recibe solo
permisos `view_*` de todos los módulos anteriores). `view_reports` es exclusivo de `ADMIN`: ningún
otro rol lo incluye, por lo que `INVENTORY`, `SALES` y `READ_ONLY` quedan bloqueados de
`/api/reports/*`.

### Dos tipos de permiso a nivel de código

- `AdministrationPermission`: controla quién puede administrar usuarios. Permite el acceso a
  superusuarios, usuarios `is_staff` o miembros del grupo `ADMIN`.
- `ModulePermission` (con una subclase por módulo: `ProductsPermission`, `LocationsPermission`,
  `SuppliersPermission`, `PurchasesPermission`, `InventoryCountsPermission`, `SalesPermission`,
  `CustomersPermission`, `InjectorsPermission`, `ServicesPermission`, `ReportsPermission`,
  `DocumentsPermission`, `MovementsPermission`): controla el acceso a los módulos de negocio.
  Resuelve el permiso Django exacto según la acción del ViewSet y el método HTTP: las acciones en
  `cancel_actions` exigen `cancel_<módulo>`, las acciones de solo lectura implementadas con un
  método HTTP no seguro (`read_actions`, ej. `labels`) exigen `view_<módulo>`, `create` exige
  `add_<módulo>`, los métodos seguros (GET/HEAD/OPTIONS) exigen `view_<módulo>`, y cualquier otro
  caso (update, destroy, o acciones que mutan estado sin ser cancelación como `confirm`,
  `approve`, `start`, `mark_ready`, `deliver`, `calculate_costs`) exige `change_<módulo>`.

A diferencia del esquema anterior a esta migración de permisos, `is_staff` por sí solo **ya no**
da acceso a los módulos de negocio: solo controla el acceso al panel `/admin/` de Django.

### Espejo en el frontend

`frontend/src/features/auth/permissions.ts` reproduce esta misma lógica en el cliente
(`hasAnyRole`, `hasModulePermission`, y funciones específicas como `canReadProducts` /
`canWriteProducts`, `canReadSales` / `canWriteSales` / `canCancelSales`, `canReadReports`, etc.)
para controlar qué puede ver y hacer cada usuario en la interfaz, en espejo del backend.

> **Pendiente de decisión:** las secciones «SSH» y «Operadores» que siguen describen controles de acceso a nivel de sistema operativo Linux, escritas antes de la migración del despliegue a la app de escritorio Windows (WSL2 + Docker Engine + Electron, ver [Despliegue en Windows](../infra/windows/README.md)). No se ha decidido si deben reescribirse para el modelo Windows/WSL2 actual o marcarse como histórico/superado (como se hizo en [deployment.md](deployment.md) y [production-readiness-checklist.md](production-readiness-checklist.md)). Se dejan sin modificar hasta que se tome esa decisión.

## SSH

En producción:

- acceso exclusivo para soporte autorizado;
- autenticación mediante llave;
- contraseña deshabilitada cuando sea posible;
- acceso root directo deshabilitado;
- firewall limitado a la red de mantenimiento.

## Django

Producción deberá usar:

```text
DEBUG=False
```

También deberá configurar:

- `ALLOWED_HOSTS`;
- cookies seguras cuando aplique;
- protección CSRF;
- encabezados de seguridad;
- límites de sesión;
- bloqueo o control de intentos;
- auditoría de accesos.

## Operadores

El usuario que utiliza el sistema no debe tener permisos administrativos sobre Linux ni Docker.

## Controles implementados actualmente

- Secretos excluidos de Git.
- `.env.prod` generado durante instalación.
- `.env.prod` con permisos restringidos.
- Nginx como único punto de entrada.
- Servicios internos sin exposición directa.
- Backend y frontend ejecutados como usuarios no root dentro de sus contenedores.
- `no-new-privileges` configurado en producción.
- `DEBUG=False` en producción.
- Encabezados básicos de seguridad configurados en Nginx.
- Backups con permisos restrictivos.
- Restauración productiva con confirmación explícita y backup preventivo.

## Controles pendientes

- Usuario operativo del sistema operativo.
- Usuario técnico separado.
- SSH con llaves.
- Firewall.
- Hardening del sistema operativo.
- Política de recuperación de credenciales administrativas.