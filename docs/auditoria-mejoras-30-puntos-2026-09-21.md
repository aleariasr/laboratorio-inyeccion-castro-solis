# Auditoría y plan de trabajo: 30 mejoras de LICS (2026-09-21)

> **Qué es este archivo.** Es el prompt y el material de apoyo para el chat que va a implementar las
> 30 mejoras. Todo lo que dice aquí se verificó leyendo el código real en el commit `7ea6e6e`
> (versión 2.3.0), en la rama `main`, el 2026-09-21. **No se cambió ningún archivo de código
> durante la auditoría.** Aun así, antes de tocar cada punto hay que volver a leer los archivos:
> el código puede haber cambiado desde esa fecha.

---

## 0. PROMPT PARA EL CHAT QUE VA A IMPLEMENTAR

Copie desde aquí hasta el final de la sección 0 como primer mensaje del chat nuevo, y adjunte este
archivo completo.

> Vas a implementar, uno por uno, los 30 puntos descritos en
> `docs/auditoria-mejoras-30-puntos-2026-09-21.md` del sistema LICS (backend Django REST en
> `backend/src`, frontend Next.js/TypeScript en `frontend/src`, escritorio Electron + WSL2 en
> `infra/windows`). La auditoría ya identificó los archivos, las causas y una propuesta de cambio
> para cada punto, además de las decisiones que ya tomé. Reglas obligatorias:
>
> 1. **No deduzcas ni inventes nada.** Antes de proponer un cambio, lee el código real de todos los
>    archivos que menciona la auditoría para ese punto, y confirma que lo que dice la auditoría sigue
>    siendo cierto. Si algo no coincide, detente y avísame.
> 2. **Si el cambio toca una función, un método, un serializer, un tipo o un componente, busca
>    TODOS los lugares donde se usa** (`grep` en backend y frontend) y revisa que el cambio no rompa
>    ninguno. En tu propuesta, enumera los usos que encontraste.
> 3. **Un punto a la vez, con cambios quirúrgicos.** Toca solo lo necesario para ese punto. No
>    reformatees, no renombres ni "mejores" código que no forma parte del punto.
> 4. **Tests en cada cambio.** Todo cambio de backend lleva tests nuevos o actualizados en el
>    `tests.py` / `tests/` de la app que corresponde. Todo cambio de frontend debe pasar `lint` y
>    `build` (el frontend no tiene runner de tests unitarios; no agregues uno sin preguntarme).
> 5. **Ciclo por punto:** (a) lees y me explicas lo que encontraste y el cambio exacto que vas a
>    hacer → (b) espero mi visto bueno si hay una decisión de diseño que no esté ya tomada en la
>    auditoría → (c) editas los archivos → (d) me das los comandos para correr la suite completa
>    → (e) yo corro los tests y te paso el resultado → (f) me propones el mensaje de commit → (g) yo
>    hago el commit → (h) siguiente punto.
> 6. **Tú editas archivos; yo corro TODOS los comandos de shell** (migrate, test, lint, build y todo
>    git). Nunca corras tú `docker compose`, `manage.py`, `npm` ni `git add/commit/push`. Si un
>    comando falla, me das el comando corregido; no lo corres tú.
> 7. **Toda migración de Django se explica antes de correrla:** qué hace, si es aditiva, compatible
>    o destructiva, y qué pasa con los datos existentes.
> 8. **Si una decisión de diseño no está resuelta en la sección 3 de la auditoría, pregúntame**
>    antes de implementar. La sección 5 marca esas dudas pendientes con "PREGUNTAR".
> 9. Sigue el orden de la sección 4 salvo que yo diga otra cosa. Al terminar cada punto, marca su
>    casilla en la sección 6 de este archivo.
>
> Empieza por el punto 30 (el primero del orden recomendado). Primero lee los archivos y dime qué
> encontraste.

---

## 1. Contexto del sistema (lo necesario para trabajar sin adivinar)

### 1.1. Comandos (los corre Alejandro, nunca el asistente)

Definidos en el `Makefile` de la raíz (Docker Compose de desarrollo en `infra/docker/compose.yml`):

- Suite completa de backend: `make test` (corre `apps.accounts apps.core apps.inventory
  apps.customers apps.sales apps.configuration apps.documents apps.cash apps.legacy_migration`).
- Por app: `make test-core`, `make test-inventory`, `make test-sales`, `make test-customers`,
  `make test-cash`, `make test-documents`, `make test-accounts`, `make test-configuration`,
  `make test-legacy-migration`.
- Migraciones: `make makemigrations` y `make migrate`.
- Frontend (dentro de `frontend/`): `npm run lint` y `npm run build`.
- **Importante:** cuando cambie un permiso de módulo, correr **siempre** `make test-core` además de
  la app tocada. `apps/core/tests.py` verifica la cantidad total de permisos (hoy `37`, línea ~447)
  y la matriz rol-permiso completa. Esta prueba ya se desactualizó una vez sin que nadie lo notara.

### 1.2. Modelo de permisos (clave para los puntos 3, 4, 5, 6, 13, 14 y 25)

- **Backend.** `backend/src/apps/core/models.py` → `ModulePermissions.Meta.permissions` declara 37
  permisos (`view_/add_/change_/cancel_<módulo>`). `backend/src/apps/core/permissions.py` →
  `ModulePermission` resuelve el permiso según la acción del ViewSet: `cancel_actions` →
  `cancel_`; `read_actions` → `view_`; `create` → `add_`; métodos seguros → `view_`; todo lo demás
  → `change_`. El superusuario y el grupo `ADMIN` pasan siempre.
  `AdministrationPermission` (usuarios, roles, estado del sistema) deja pasar a superusuario,
  **`is_staff`** o grupo `ADMIN`.
- **Roles.** `backend/src/apps/core/management/commands/setup_roles.py` → `ROLE_PERMISSIONS`
  asigna los permisos a `INVENTORY`, `SALES`, `CUSTOMERS` y `READ_ONLY`; `ADMIN` recibe todos.
  `setup_roles` corre en cada instalación y actualización (`scripts/install.sh:509`,
  `scripts/update.sh:464`, `infra/docker/compose.yml:46`,
  `infra/windows/wsl/provision-golden-image.sh:182`), así que cambiar `ROLE_PERMISSIONS` se
  aplica solo en la próxima actualización.
- **Agregar un permiso nuevo** implica: tupla nueva en `ModulePermissions.Meta.permissions`
  (genera una migración `AlterModelOptions` en `apps/core/migrations/`), actualizar
  `ROLE_PERMISSIONS`, actualizar el conteo `37` y la matriz en `apps/core/tests.py`, y actualizar
  el frontend (siguiente punto).
- **Frontend: trampa importante.** `UserSerializer.permissions` (`apps/accounts/serializers.py`)
  expone **solo los permisos individuales** del usuario (`source="user_permissions"`), **no** los
  que hereda de sus grupos. Por eso `frontend/src/features/auth/permissions.ts` **replica a mano**
  qué rol puede hacer qué (por ejemplo, `canReadProducts` = `hasAnyRole(["INVENTORY","READ_ONLY"])`
  o el permiso individual `view_products`). **Todo cambio en `ROLE_PERMISSIONS` debe reflejarse
  en las listas de roles de `permissions.ts`**; si no, el frontend esconde pantallas que el backend
  sí permite, o al revés.
- `frontend/src/features/users/types.ts:82` → `PERMISSION_MODULES` (la matriz de casillas de la
  pantalla de usuarios) **ya está desactualizada**: no incluye `add_documents` ni `view_cash` y
  `add_cash`, que sí existen en el backend. Corregirla cuando se toquen permisos (punto 4).

### 1.3. Patrones ya establecidos en este código (reutilizarlos)

- Excepciones de dominio atrapadas en la vista → `Response({"detail": str(exc) or
  exc.__class__.__name__}, status=400)`.
- Movimientos de stock solo por `StockMovement.create_from_service(...)` (el `save()` directo lanza
  `InventoryError`). Una reversión es un movimiento nuevo de tipo `REVERSAL`, con dirección
  contraria, la misma cantidad y `reverses_movement=<original>` (OneToOne: un movimiento solo se
  puede revertir una vez). Modelo: `backend/src/apps/inventory/models/stock.py`.
- Líneas atadas a stock o dinero (PurchaseItem, SaleItem, InjectorServiceAccessory) son
  "inmutables: se borran y se crean de nuevo" mientras el documento está en borrador.
- Una transición que fija un monto en un total de dinero debe validar que ese monto no sea nulo
  (precedente: `ServiceMissingPriceError` en `deliver_service`).
- Formato de montos en el frontend: `formatMoney` / `formatNumber` de
  `frontend/src/features/inventory/purchases/format.ts`.
- **Fechas:** los campos de solo fecha (`*_date`, `week_start`) y los de fecha y hora
  (`created_at`, `delivered_at`) necesitan formateadores distintos. `formatDate` de `format.ts` es
  para fecha y hora; con un `"YYYY-MM-DD"` pelado corre la fecha un día hacia atrás en
  `America/Costa_Rica`. Para campos de solo fecha, usar el patrón local de
  `frontend/src/app/search/page.tsx` (agrega `T00:00:00`).
- PDF: reportlab, con los helpers de `backend/src/apps/documents/pdf.py` (banner con los colores de
  marca `#075184` / `#eaf3f8`, pie de página, `_format_money`). Las vistas PDF son `APIView`
  sencillas; si una de ellas escribe con POST, necesita `action = "create"` como atributo de clase
  (ver el docstring de `ProformaPdfView` en `apps/documents/views.py`).
- Descarga de archivos en el frontend: el mismo patrón de `getSaleInvoicePdf` /
  `getServiceInvoicePdf` (se pide un blob y se descarga con un `<a download>` temporal).
- Todo `setState` dentro de un `useEffect` de montaje va en `setTimeout` (regla de lint
  `react-hooks/set-state-in-effect`).

### 1.4. Hallazgo transversal: el total de una venta se calcula en 6 lugares

`quantity * unit_price` se suma por separado en:

1. `backend/src/apps/sales/selectors/sale.py` → `sale_total()` (lo usa `SaleSerializer.total`).
2. `backend/src/apps/cash/selectors.py:18` → `sales_total_by_method()` (cierre de caja).
3. `backend/src/apps/core/views/reports.py` ~529 → `SalesByDateReportView`.
4. `backend/src/apps/core/views/reports.py` ~598 → `TopSellingProductsReportView`.
5. `backend/src/apps/core/views/reports.py` ~672 → `TopCustomersReportView`.
6. `backend/src/apps/documents/pdf.py:435` → `build_sale_invoice_pdf()`.

Y el total de un servicio (`InjectorServiceRecord.price`) se suma en `cash/selectors.py:42`
(`services_total_by_method`, con `Sum("price")`) y se imprime en `pdf.py:465`. **Cualquier cambio
al cálculo del total (impuesto y descuento, puntos 18, 19, 20 y 26) tiene que cubrir todos estos
lugares.** Diferencia ya existente que conviene saber: el cierre de caja filtra
`sale__is_active=True` y los reportes no.

---

## 2. Cómo leer la sección 5

Cada punto tiene: **Estado verificado** (lo que hace hoy el código), **Archivos**, **Cambio
propuesto**, **Usos a revisar** (dónde más impacta), **Tests**, **Migración** y **Dudas**. "PREGUNTAR"
quiere decir que la decisión no está tomada y hay que consultarla antes de implementar.

---

## 3. Decisiones ya tomadas por Alejandro (2026-09-21)

| Tema | Decisión |
|---|---|
| Rol INVENTARIO (puntos 13, 4) | **Solo productos y ubicaciones.** Pierde compras, proveedores y conteos. Ve producto, ubicación, stock y **solo el precio de venta**. Compras, proveedores y conteos quedan solo para Administrador. |
| Operario de servicios (punto 25) | El operario (rol `CUSTOMERS` / "Clientes y servicio") recibe, inicia y marca listo. **Solo el Administrador define el precio (y el tipo de servicio) y entrega.** |
| Genérico con código distinto (punto 16) | **Código propio adicional:** el genérico sigue en la familia del código universal (`standard_code`), pero además tiene su propio código, que se muestra y se puede buscar. |
| Impuesto y descuento (puntos 15, 19, 26) | **Al documento completo:** un descuento (monto exacto **o** porcentaje) sobre el subtotal, y un impuesto (porcentaje editable) sobre el subtotal ya con descuento. Si están en cero, no aparecen en el documento. |
| Caja chica (puntos 21, 22) | Al cerrar la semana se define el fondo inicial de caja chica de la semana siguiente; durante la semana se registran **salidas** (monto y motivo); el cierre muestra fondo inicial − salidas = saldo de caja chica, y efectivo de ventas/servicios + saldo de caja chica = efectivo que debe haber físicamente. Solo salidas (no se pidieron entradas ni reposiciones). |
| PDF e imprimir (puntos 2, 27) | **PDF generado en el servidor** (reportlab, mismo diseño de la proforma) con botón "Descargar PDF", y botón "Imprimir" que abre ese mismo PDF. Con líneas en blanco para anotar a mano. |
| Excel (punto 28) | **`.xlsx` real** con `openpyxl` (dependencia nueva de backend). |
| Cierres de caja (puntos 1, 9) | Filtro por **rango de fechas** y buscador en notas/motivo. Se bloquea cerrar una semana cuyo viernes todavía no ha llegado. |

---

## 4. Orden recomendado (según dependencias y riesgo)

| Fase | Puntos | Por qué en este orden |
|---|---|---|
| A. Bugs aislados, riesgo bajo | 30, 5, 11, 10, 9, 8, 29, 12, 6, 24, 1 | Cada uno toca pocos archivos y no depende de otros puntos. |
| B. Cuentas y permisos | 3, luego 13 + 4 + 14 (un solo rediseño, en varios commits), luego 25 | 4, 13 y 14 tocan los mismos archivos (`setup_roles`, `permissions.ts`, serializer de producto); hacerlos juntos evita tener que rehacer trabajo. |
| C. Precio en la venta | 17 + 23 | Son el mismo cambio. Conviene hacerlo antes de meter impuestos en ventas. |
| D. Impuesto y descuento | 19 → 26 → 15 → 18 → 20 | 19 define el modelo de montos de la venta; 26 lo replica en servicios; 15 reutiliza el cálculo; 18 y 20 lo consumen. |
| E. Caja chica | 21 + 22 | Después de 18, porque ambos agregan campos al cierre de caja. |
| F. Exportaciones | 2 + 27, luego 28 | 2 y 27 comparten el generador de PDF de reportes. 20 debe existir antes para incluirlo. |
| G. Código propio del genérico | 16 | Toca el modelo `Product`, la búsqueda y la migración legacy; va aislado. |
| H. Electron | 7 | Sin tests automáticos posibles; se valida a mano en la máquina Windows. |

---

## 5. Los 30 puntos

### Punto 1. Filtro y buscador en cierres de caja

- **Estado verificado:** `CashClosingViewSet.get_queryset()` (`backend/src/apps/cash/views.py:37`)
  devuelve `cash_closings()` sin leer ningún parámetro. `frontend/src/features/cash/api.ts` →
  `getCashClosings` solo manda `page` y `page_size`; `CashClosingFilters`
  (`features/cash/types.ts`) solo tiene `page` y `pageSize`. `frontend/src/app/cash/page.tsx` no
  tiene controles de filtro.
- **Decisión:** rango de fechas y buscador en notas/motivo (sección 3).
- **Cambio propuesto:** backend: en `get_queryset`, leer `date_from` y `date_to` con
  `parse_date_query_param` (`apps/core/query_params.py`, el mismo patrón que
  `PurchaseViewSet.get_queryset`, que además valida `date_from > date_to` → 400) y filtrar las
  semanas que se superponen con el rango (`week_end >= date_from`, `week_start <= date_to`); leer
  `q` y filtrar por `Q(notes__icontains=q) | Q(difference_reason__icontains=q)`. Frontend: agregar
  `query`, `dateFrom` y `dateTo` a `CashClosingFilters`, mandarlos en `getCashClosings` y agregar
  los controles, con el mismo patrón de `app/inventory/purchases/page.tsx` (búsqueda con debounce,
  inputs de fecha, "Limpiar filtros" y volver a la página 1 al filtrar).
- **Usos a revisar:** `cash_closings()` solo se usa en `CashClosingViewSet.get_queryset`
  (grep). `pending_closing_week_start` (dashboard) consulta `CashClosing.objects` directamente, así
  que no se ve afectado. Filtrar en la vista, sin cambiar el selector.
- **Tests:** en `apps/cash/tests.py`: filtro por rango, filtro `q` por notas y por motivo, rango
  invertido → 400, sin filtros → todo.
- **Migración:** no.

### Punto 2. Exportar a PDF todos los reportes (junto con el punto 27)

- **Estado verificado:** ningún reporte exporta nada. Reportes existentes (índice en
  `frontend/src/app/reports/page.tsx`): Bajo mínimo (`/api/reports/low-stock-products/`), Stock
  por ubicación (`/api/reports/stock-by-location/`, pantalla `app/inventory/stock-by-location`),
  Movimientos (pantalla `app/inventory/movements`, que usa `/api/inventory/stock-movements/`),
  Compras por proveedor, Comparación de precios por proveedor, Ventas por fecha, Productos más
  vendidos y Clientes con más ventas. Backend: `backend/src/apps/core/views/reports.py`, rutas en
  `apps/core/urls.py`. Todos usan `ReportsPermission` salvo Movimientos (`MovementsPermission`).
  Casi todos paginan con `StandardResultsSetPagination`. `/api/reports/product-movements/`
  (`ProductMovementsReportView`) existe en el backend, pero **ninguna pantalla del frontend lo
  usa** (grep sin resultados).
- **Decisión:** PDF generado en el servidor con el diseño de la proforma (sección 3).
- **Cambio propuesto:**
  1. En `apps/documents/pdf.py`, un generador genérico de reporte tabular
     `build_report_pdf(*, title, subtitle, columns, rows, totals=None, blank_rows=0)` que reutilice
     `_draw_document_banner`, `_draw_document_footer` y `_format_money` y haga el salto de página
     como `_build_itemized_document_pdf`. **No modificar** `_build_itemized_document_pdf`: la
     usan la proforma y la factura de venta.
  2. Para no duplicar la lógica de consulta de cada reporte, extraer de cada `...ReportView.get`
     la construcción de `results` a una función (por ejemplo, `_sales_by_date_rows(date_from,
     date_to)`) que usen tanto la respuesta JSON paginada como el PDF (el PDF sin paginar).
     Exponer el PDF como `?format=pdf` en la misma URL o como una ruta hermana `.../pdf/`;
     **proponer una sola convención y aplicarla a todos**. Cuidado: DRF ya interpreta `?format=`
     para elegir el renderer; si se usa ese nombre, un renderer desconocido responde 404. Es más
     seguro usar una ruta hermana `.../pdf/`.
  3. El PDF respeta los mismos filtros que la pantalla (fechas, ubicación, etc.).
  4. Frontend: botón "Descargar PDF" en cada pantalla de reporte (patrón de descarga de blob de
     `getSaleInvoicePdf`).
- **Usos a revisar:** cada `ReportView` que se refactorice; comprobar que la respuesta JSON no
  cambie (los tests existentes de `apps/core/tests.py` para reportes deben seguir pasando sin
  modificarlos).
- **Tests:** por reporte: el PDF responde 200 con `application/pdf`, respeta el permiso
  (usuario sin `view_reports` → 403) y respeta los filtros (fechas inválidas → 400).
- **Migración:** no.
- **Dudas:** PREGUNTAR si el cierre de caja (detalle de un cierre) también cuenta como "reporte"
  y necesita PDF. La frase dice "todos los reportes"; el cierre no está en el índice de reportes.

### Punto 3. Cambio y reseteo de contraseñas de usuarios

- **Estado verificado:** no existe ningún endpoint para cambiar la contraseña. `set_password` solo
  aparece en `UserCreateSerializer.create` (`apps/accounts/serializers.py:133`). `UserSerializer`
  (PATCH) no tiene campo de contraseña (hay un test que lo garantiza:
  `test_patch_does_not_change_password`, `apps/accounts/tests.py:160`). En el frontend, el campo
  contraseña solo aparece con `mode === "create"` (`features/users/user-form.tsx`).
- **Cambio propuesto:**
  1. **Reseteo por el administrador:** `@action(detail=True, methods=["post"],
     url_path="set-password")` en `UserViewSet` (ya protegido por `AdministrationPermission`), con
     un serializer que valide `password` (mínimo 8, igual que en la creación; opcionalmente
     `django.contrib.auth.password_validation.validate_password`, PREGUNTAR si se quieren las
     reglas de Django o solo el mínimo de 8). Al guardar: `set_password` y **borrar el token**
     (`Token.objects.filter(user=user).delete()`) para cerrar las sesiones abiertas de ese
     usuario.
  2. **Cambio de la propia contraseña:** `POST /api/accounts/me/password/` (`IsAuthenticated`),
     que pida `current_password` (verificada con `check_password`) y `new_password`. Después del
     cambio, borrar el token y devolver uno nuevo para no sacar al usuario de la sesión actual (o
     forzar un login nuevo: PREGUNTAR cuál prefiere).
  3. Frontend: en `app/users/[id]/page.tsx`, botón "Restablecer contraseña" (con formulario en
     línea o modal, y `confirmWithFocusRestore`); para el usuario propio, una opción "Cambiar mi
     contraseña" (PREGUNTAR dónde: menú del usuario en `components/layout/app-shell.tsx` o una
     página `/account`).
- **Usos a revisar:** `LoginView` usa `Token.objects.get_or_create`; borrar el token es
  compatible. `features/auth/auth-context.tsx` maneja los 401 (cierra la sesión); verificar que al
  cambiar la propia contraseña no se dispare un logout inesperado.
- **Tests:** un admin resetea a otro usuario; un no-admin → 403; una contraseña corta → 400; el
  token viejo deja de servir; el cambio propio con la contraseña actual incorrecta → 400; el cambio
  propio correcto permite iniciar sesión con la contraseña nueva. `test_patch_does_not_change_password`
  debe seguir pasando.
- **Migración:** no.

### Punto 4. Permisos de lectura para los roles Ventas y Clientes y servicio

- **Estado verificado (bug real):** `ROLE_PERMISSIONS[SALES]` y `ROLE_PERMISSIONS[CUSTOMERS]`
  (`setup_roles.py`) **no incluyen `view_products`**. Consecuencias:
  - `features/sales/sale-item-form.tsx` recibe `canReadProducts={hasProductsAccess}`
    (`app/sales/[id]/page.tsx:981`, con `hasProductsAccess = canReadProducts(user)`) → un usuario
    SALES ve "No tiene permiso para buscar productos." y **no puede agregar líneas a una venta**.
  - `features/services/service-accessory-form.tsx` busca con `searchActiveProducts`
    (`/api/inventory/products/`) → un usuario CUSTOMERS **no puede agregar accesorios**
    (`app/services/[id]/page.tsx:1094`).
- **Riesgo si solo se agrega `view_products`:** con `view_products` también se ven costos
  (ver punto 13): `ProductCostHistoryViewSet` usa `ProductsPermission`
  (`apps/inventory/views/costs.py:98`), `ProductSerializer` expone `latest_suggested_price`
  (derivado del costo) y la pantalla de detalle de producto muestra "Costos y precio"
  (`app/inventory/products/[id]/page.tsx:1019`). Además, `DashboardSummaryView` muestra la lista
  de bajo stock a cualquiera con `view_products` y la búsqueda universal mostraría productos.
  **Por eso este punto se hace junto con el 13 y el 14.**
- **Cambio propuesto (en conjunto con 13 y 14):** ver el "Rediseño de permisos" en el punto 13.
  Para SALES y CUSTOMERS: agregar `view_products` (y `view_locations` solo si una pantalla que
  usan la necesita; verificar con grep antes). Actualizar `canReadProducts` en
  `features/auth/permissions.ts` para incluir `SALES` y `CUSTOMERS`.
- **Usos a revisar:** todos los usos de `canReadProducts` (grep: `app/sales/[id]/page.tsx`,
  `app/inventory/purchases/[id]/page.tsx`, `app/inventory/suppliers/[id]/page.tsx`,
  `app/services/[id]/page.tsx`, `app/inventory/locations/[id]/page.tsx`,
  `app/inventory/counts/[id]/page.tsx`, `app/reports/product-supplier-prices/page.tsx`,
  `app/inventory/products/page.tsx` y `[id]/page.tsx`) y `NAVIGATION_ITEMS` (Productos aparecería
  en el menú de SALES y CUSTOMERS: PREGUNTAR si se quiere mostrar el menú Productos a esos roles o
  solo habilitar la búsqueda dentro de venta/servicio).
- **Tests:** `apps/core/tests.py` (matriz de roles); tests nuevos: un usuario SALES puede listar
  productos y crear una línea de venta; un usuario CUSTOMERS puede agregar un accesorio; ninguno de
  los dos ve costos (ver punto 13).
- **Migración:** solo si se crea un permiso nuevo (punto 13).
- **Además:** corregir `PERMISSION_MODULES` en `features/users/types.ts:82` (le faltan `add_documents`,
  `view_cash` y `add_cash`, y le faltará el permiso nuevo del punto 13).

### Punto 5. Texto engañoso de is_staff

- **Estado verificado:** `features/users/user-form.tsx:394-398` dice "Acceso administrativo
  (is_staff) — Equivale al rol Administrador: permite administrar usuarios y acceder a todos los
  módulos…". **Es falso.** Lo que realmente da `is_staff`:
  - Backend: `AdministrationPermission` → administrar usuarios y roles (`UserViewSet`,
    `RoleListView`) y ver el estado del sistema (`apps/configuration/views.py:12`), además del
    panel `/admin/` de Django. `ModulePermission` **no** deja pasar a `is_staff`: no da acceso a
    ningún módulo de negocio.
  - Frontend: `isAdministrativeUser` (`features/auth/permissions.ts`) incluye `is_staff` → ve
    "Usuarios" y "Estado del sistema" en el menú; `hasAnyRole` / `isModuleAdmin` **no** lo
    incluyen.
- **Cambio propuesto:** solo el texto. Etiqueta sugerida: "Administración de usuarios (is_staff)";
  descripción: "Permite administrar usuarios y roles, ver el estado del sistema y entrar al panel
  técnico de Django. **No** da acceso a inventario, ventas, servicios ni reportes: para eso marque
  el rol Administrador o los permisos de abajo." (PREGUNTAR si prefiere esconder la casilla en
  vez de corregir el texto.)
- **Usos a revisar:** el mensaje del serializer "No puede quitarse su propio acceso administrativo
  (is_staff)." (`apps/accounts/serializers.py`) sigue siendo correcto. `docs/security.md` y
  `README.md:369` ya describen bien el comportamiento; no hace falta tocarlos.
- **Tests:** frontend `lint` y `build`.
- **Migración:** no.

### Punto 6. "Movimientos" no se puede abrir con Inventario ni con Solo lectura

- **Estado verificado:** `NAVIGATION_ITEMS` (`components/navigation/navigation-config.ts`) **no
  tiene** una entrada `/inventory/movements`. La única forma de llegar es la tarjeta de
  `app/reports/page.tsx:51`, y esa página exige `canReadReports` (solo ADMIN o `view_reports`).
  INVENTORY y READ_ONLY sí tienen `view_movements` (backend y `canReadMovements`), pero no tienen
  cómo llegar a la pantalla. Además, "Volver" en `app/inventory/movements/page.tsx` (`goBack`,
  ~389) debe revisarse para que no mande a `/reports` a quien no puede verlo.
- **Cambio propuesto:** agregar a `NAVIGATION_ITEMS`, sección `inventory`, `{ href:
  "/inventory/movements", label: "Movimientos", icon: ArrowsUpDownIcon, permissionCheck:
  canReadMovements }` (el ícono ya existe en `components/icons/app-icons.tsx` y lo usa la tarjeta
  de reportes). Revisar `goBack`.
- **Usos a revisar:** `NAVIGATION_ITEMS` solo lo consume `components/navigation/app-navigation.tsx`
  (grep), a través de `canAccessNavigationItem`.
- **Dependencia:** con la decisión del punto 13, INVENTORY conserva `view_movements` (no se pidió
  quitarlo). PREGUNTAR si Movimientos debe seguir visible para INVENTORY, dado que el origen de un
  movimiento muestra "Compra <número de factura>" con enlace a la compra (a la que INVENTORY ya no
  tendrá acceso). Si se mantiene, el enlace debe ocultarse cuando `!canReadPurchases(user)`.
- **Tests:** `lint` y `build`; los tests de backend de `MovementsPermission`
  (`apps/inventory/tests/test_movements_permissions.py`) no cambian.
- **Migración:** no.

### Punto 7. Menús de Electron (actualizar, reiniciar) sin progreso, sin confirmación y con errores poco claros

- **Estado verificado:** `infra/windows/electron/main.js:108` → `withBusyMenuAction` llama a
  `setStatus(...)`, que manda `lics:status` a la página cargada en ese momento. **Solo
  `renderer/loading.html` escucha ese evento** (`window.lics.onStatus`). Cuando la app Next ya
  está cargada (el caso normal al usar el menú), nadie escucha: **el usuario no ve ningún
  progreso** durante "Hacer backup ahora", "Reiniciar servicios" ni "Actualizar aplicación".
  "Hacer backup ahora" (`:152`) y "Reiniciar servicios" (`:156`) **no piden confirmación** (solo
  "Actualizar" la pide, `:161`). El error sale de `lib/backend.js` → `spawnInDistro`: "Falló dentro
  de WSL (código N): <últimos 2000 caracteres de stderr>". Solo usa stderr, y ahí se mezclan los
  mensajes normales de `docker compose`, así que el motivo real puede quedar enterrado o cortado.
  Los scripts marcan sus errores con el prefijo `[ERROR]` (`scripts/lib/common.sh:46`,
  `log_error`).
- **Cambio propuesto:**
  1. Antes de ejecutar una acción, `mainWindow.loadFile(renderer/loading.html)` (igual que hace
     "Reintentar") y esperar a que termine de cargar (`did-finish-load`) para que `setStatus` sí
     llegue; al terminar bien, volver a `APP_URL` (ya se hace).
  2. Mostrar en `loading.html` el paso actual y el historial de líneas (no solo la última). Un
     botón o texto "Esto puede tardar varios minutos" para la actualización.
  3. Confirmación (`dialog.showMessageBox`, botones Cancelar/Continuar) para backup y reinicio,
     avisando que la app queda sin servicio unos minutos.
  4. Error específico: en `spawnInDistro`, guardar las últimas N líneas de stdout y stderr juntas,
     y extraer las líneas que empiezan con `[ERROR]`. El diálogo muestra primero esas líneas ("Qué
     falló") y después el código de salida y la cola del log. Guardar el log completo en un archivo
     (`app.getPath('logs')`) e indicar su ruta en el diálogo. Si falla, dejar la pantalla de carga
     con el error y la opción "Reintentar", en lugar de dejar la app en un estado incierto.
  5. Evitar que se lancen dos acciones a la vez (bandera `isBusy`; deshabilitar los ítems del menú
     mientras corre una).
- **Usos a revisar:** `startupSequence` y "Reintentar" también usan `setStatus` y `loading.html`;
  no deben cambiar de comportamiento. `preload.js` expone solo `onStatus`; si se agrega un canal
  nuevo (por ejemplo, historial), agregarlo ahí.
- **Tests:** no hay tests automáticos para Electron. Prueba manual en la máquina Windows: backup
  correcto, reinicio correcto, error forzado (por ejemplo, apagar Docker dentro de WSL) → el
  diálogo muestra la línea `[ERROR]`. Documentar el resultado en
  `docs/windows-production-checklist.md`.
- **Migración:** no.

### Punto 8. Los accesorios no vuelven al inventario al anular un servicio

- **Estado verificado (bug real):** `cancel_service` (`backend/src/apps/customers/services/service_record.py:117`)
  solo cambia el estado a `CANCELLED`; no toca `service_record.accessories`. Los movimientos
  `SERVICE_USE`/`OUT` creados por `add_service_accessory` (`services/service_accessory.py`) quedan
  vigentes: el stock no regresa. Como el servicio anulado queda "bloqueado"
  (`_LOCKED_STATUSES`), después **tampoco** se pueden quitar los accesorios uno por uno.
  Comparar con `cancel_sale` (`apps/sales/services/sale.py`), que sí revierte cada línea.
- **Cambio propuesto:** dentro de `cancel_service` (ya es `@transaction.atomic`), antes de cambiar
  el estado, por cada accesorio: buscar el movimiento original (`movement_type=SERVICE_USE,
  direction=OUT, reverses_movement__isnull=True`), igual que `remove_service_accessory`, y crear
  la reversión (`REVERSAL`, `IN`, misma cantidad, `service_accessory=accessory`,
  `reverses_movement=original`, notas "Anulación de servicio #N"). **No borrar** los accesorios
  (quedan como registro histórico del servicio anulado, igual que las líneas de una venta anulada).
  Se recomienda factorizar la creación de la reversión en una función privada compartida con
  `remove_service_accessory` para no duplicarla, sin cambiar el comportamiento de esa función.
  Idempotencia: `reverses_movement` es OneToOne, así que una segunda reversión fallaría; la
  validación existente "El servicio ya está anulado." lo evita.
- **Usos a revisar:** `cancel_service` solo se llama desde `InjectorServiceRecordViewSet.cancel`
  (grep). `remove_service_accessory` lo usa `InjectorServiceAccessoryViewSet.destroy`. El
  `StockMovementSerializer` y la pantalla de movimientos deben mostrar bien un `REVERSAL` con
  `service_accessory` (hoy el serializer no expone `service_accessory`; ver punto 12).
- **Tests:** en `apps/customers/tests/test_service_record_services.py` (o `..._api.py`): anular un
  servicio con 2 accesorios → el stock vuelve al valor anterior, hay 2 movimientos `REVERSAL` con
  el `reverses_movement` correcto, y los accesorios siguen existiendo. Anular sin accesorios sigue
  funcionando. Anular dos veces → error y no se crean reversiones duplicadas.
- **Migración:** no.
- **Datos existentes:** servicios ya anulados con accesorios quedaron con el stock descontado.
  PREGUNTAR si se quiere un comando o una migración de datos para corregirlos (el sistema no está en
  producción, así que probablemente no hace falta).

### Punto 9. Caja: sin validación de semana futura

- **Estado verificado:** `create_cash_closing` (`backend/src/apps/cash/services.py:18`) solo
  valida que `week_start` sea sábado y que la semana no se haya cerrado ya. `preview`
  (`apps/cash/views.py`, ~90) tampoco valida. Se puede cerrar una semana que todavía no terminó (o
  de dentro de un año) y el total esperado queda congelado incompleto para siempre (el cierre no se
  puede editar ni borrar).
- **Decisión:** bloquear si el viernes de la semana todavía no llegó (sección 3).
- **Cambio propuesto:** en `create_cash_closing`, después del chequeo de sábado:
  `if week_end > timezone.localdate(): raise FutureWeekClosingError(...)` (excepción nueva en
  `apps/cash/exceptions.py`, atrapada en la vista junto a las demás). El viernes mismo sí se
  permite (se cierra los viernes). En `preview`, **permitir** la consulta de una semana en curso
  (sirve para ver cómo va) pero agregar en la respuesta un campo `can_close: bool`. En el frontend
  (`features/cash/validation.ts` y `cash-closing-form.tsx`), mostrar el error y deshabilitar el
  envío si `week_end > hoy`, y poner `max` en el input de fecha.
- **Usos a revisar:** `pending_closing_week_start` (dashboard) calcula la última semana
  **terminada**, así que no se ve afectado.
- **Tests:** cerrar una semana futura → 400; cerrar la semana en curso antes del viernes → 400;
  cerrar el viernes mismo → 201. Usar fechas relativas a `timezone.localdate()` (no fijas) o
  `unittest.mock.patch` de `timezone.localdate`. Revisar que los tests existentes de
  `apps/cash/tests.py` no usen semanas futuras fijas (si las usan, ajustarlos).
- **Migración:** no.

### Punto 10. El instalador sale con versión 0.1.0

- **Estado verificado:** `infra/windows/electron/package.json` → `"version": "0.1.0"`. electron-builder
  usa ese campo para el nombre del instalador (por defecto `LICS Setup 0.1.0.exe`) y para la versión
  que muestra Windows en "Aplicaciones instaladas". La versión real del sistema es `VERSION` =
  `2.3.0` (la usa `scripts/build-offline-release.sh`). El workflow
  `.github/workflows/build-windows-installer.yml` no sincroniza la versión.
- **Cambio propuesto:** en el workflow, antes de `npm run dist`, un paso que lea `VERSION` de la
  raíz y ejecute `npm version <v> --no-git-tag-version --allow-same-version` en
  `infra/windows/electron` (el `working-directory` por defecto del job ya es esa carpeta, así que
  la ruta a `VERSION` es `..\..\..\VERSION`; shell `powershell` 5.1). Además, fijar a mano
  `package.json` en la versión actual para que un build local no salga como 0.1.0. **No tocar**
  `frontend/package.json` (`0.1.0`, `private: true`, no se muestra en ningún lado).
- **Usos a revisar:** que nada en `main.js` ni en `lib/backend.js` dependa de `app.getVersion()`
  (grep sin resultados en la auditoría).
- **Tests:** correr el workflow y verificar el nombre del `.exe` y la versión en Windows.
- **Migración:** no.

### Punto 11. Archivo de migración vacío en el frontend

- **Estado verificado:** `frontend/src/app/inventory/migrations/0019_remove_supplierproduct_supplier_reference.py`
  pesa 0 bytes y es el único archivo de esa carpeta. Llegó en el commit `ec88dee` (según
  `git log`). La migración real está en
  `backend/src/apps/inventory/migrations/0019_remove_supplierproduct_supplier_reference.py`.
- **Cambio propuesto:** borrarlo con `git rm` (lo corre Alejandro). La carpeta
  `frontend/src/app/inventory/migrations/` queda vacía y desaparece.
- **Usos a revisar:** grep de `migrations` en `frontend/`: nada lo importa.
- **Tests:** `npm run build` (Next ignora los `.py`, pero se confirma que no cambia nada).
- **Migración:** no.

### Punto 12. Poder hacer clic en el historial de movimientos para ir a la compra o la venta

- **Estado verificado:** en **Detalle de producto** (`app/inventory/products/[id]/page.tsx:151`),
  `getMovementReference()` devuelve **solo texto** ("Compra X", "Venta #N", "Conteo X"), que se
  pinta en `:1324` sin enlace. En cambio, la pantalla Movimientos
  (`app/inventory/movements/page.tsx`, `getMovementOrigin`) **ya** tiene enlaces
  (`purchase_id` → `/inventory/purchases/:id`, `sale_id` → `/sales/:id`, conteo →
  `/inventory/counts/:id`).
  Faltantes relacionados: `StockMovementSerializer` (`apps/inventory/serializers/stock_movement.py`)
  **no expone** `service_accessory` ni el id del servicio, así que un movimiento `SERVICE_USE` sale
  como "Sin documento asociado"; y el tipo frontend `StockMovementType`
  (`features/inventory/movements/types.ts`) **no incluye `SERVICE_USE`** (ni en
  `STOCK_MOVEMENT_TYPE_OPTIONS`, así que no se puede filtrar por él).
- **Cambio propuesto:** reutilizar la misma lógica en los dos lugares: mover `getMovementOrigin` a
  `features/inventory/movements/` (por ejemplo, `origin.ts`) y usarla también en el detalle de
  producto, pintando un `<Link>` cuando hay `href`. Ocultar el enlace si el usuario no tiene
  permiso para ver el destino (`canReadPurchases` / `canReadSales` / `canReadInventoryCounts`).
  Backend: agregar `service_record_id` al serializer (`obj.service_accessory.service_record_id`,
  que puede ser nulo porque la FK es `SET_NULL`) y `select_related("service_accessory")` en
  `StockMovementViewSet.get_queryset`. Frontend: agregar `SERVICE_USE` al tipo y a las opciones, y
  el origen "Servicio #N" → `/services/:id`.
- **Usos a revisar:** `StockMovement` (el tipo) lo reexporta `features/inventory/products/types.ts`
  y lo usan el detalle de producto y la pantalla de movimientos. El endpoint `getProductStockMovements`
  usa el mismo serializer. Agregar un campo al serializer no rompe a quienes lo consumen.
- **Tests:** backend: un movimiento de un accesorio de servicio expone `service_record_id`; uno sin
  servicio expone `null`. Frontend: `lint` y `build`.
- **Migración:** no.

### Punto 13. Inventario: sin costos, sin proveedor, sin conteos; solo producto, ubicación y precio de venta

- **Estado verificado:** hoy INVENTORY tiene compras, proveedores y conteos (`setup_roles.py`), y
  quien tiene `view_products` ve costos por estas vías:
  1. `GET /api/inventory/product-cost-history/` → `ProductCostHistoryViewSet` con
     `ProductsPermission` (`apps/inventory/views/costs.py:98`): costo original, factor, costo
     final, sugerido, **compra y proveedor** (`select_related("purchase__supplier")`).
  2. `ProductSerializer.latest_suggested_price` (derivado del costo más margen) en todos los
     endpoints de producto.
  3. Detalle de producto, sección "Costos y precio" (`[id]/page.tsx:1017-1165`: "Precio sin
     costos", "Último precio de costo", "Precio de venta sugerido") y la línea "Tomado del último
     precio sugerido calculado en una compra".
  4. `features/sales/sale-item-form.tsx:178` → `getLatestProductCostHistory` (ver punto 14).
  5. Compras y proveedores completos (costos y proveedor), y el reporte de comparación de precios
     (este ya es solo de ADMIN).
- **Decisión:** INVENTORY queda solo con productos y ubicaciones (sección 3).
- **Rediseño de permisos propuesto (un solo diseño para 4, 13 y 14):**
  1. Permiso nuevo **`view_costs`** ("Costos: ver") en `ModulePermissions`: controla todo dato
     derivado de un costo de compra. Solo lo tiene ADMIN (PREGUNTAR si READ_ONLY también debe
     tenerlo; hoy READ_ONLY ve compras con costos a través de `view_purchases`).
  2. `ProductCostHistoryViewSet` → cambiar `ProductsPermission` por una clase `CostsPermission`
     (`module = "costs"`). **Revisar sus usos en el frontend:** `getLatestProductCostHistory`
     (detalle de producto, `sale-item-form`), `getProductCostHistory`
     (`purchase-costs-section.tsx`), y el `.catch(() => null)` del detalle de producto (hoy traga
     el error, así que un 403 simplemente oculta la sección: verificar).
  3. `ProductSerializer`: devolver `latest_suggested_price` **solo** si el usuario tiene
     `view_costs` (vía `self.context["request"]`); si no, `null`. Cuidado:
     **`effective_sale_price` cae al sugerido cuando no hay `custom_sale_price`**. Eso es
     precio de venta (no costo) y debe seguir visible para todos. PREGUNTAR si el precio de venta
     calculado a partir del sugerido cuenta como "precio de venta" (se asume que sí). Revisar los
     otros lugares que construyen `ProductSerializer` sin `request` en el contexto:
     `ProductViewSet.add_variant` (`ProductSerializer(variant).data`, sin contexto) y cualquier
     otro que aparezca con grep: pasarles `context={"request": request}`.
  4. `ROLE_PERMISSIONS[INVENTORY]` = `view_products`, `add_products`, `change_products`,
     `view_locations`, `add_locations`, `change_locations`, `view_movements` (PREGUNTAR, ver punto
     6), `view_documents`, `add_documents` (PREGUNTAR si INVENTORY sigue generando proformas y
     etiquetas). Se quitan suppliers, purchases e inventory_counts.
  5. Frontend `permissions.ts`: quitar `"INVENTORY"` de `canRead/canWrite` de Suppliers, Purchases
     e InventoryCounts; agregar `canReadCosts(user)` = `isModuleAdmin(user) ||
     hasModulePermission(user, "view_costs")`; en el detalle de producto, mostrar "Costos y precio"
     solo con `canReadCosts`, y el precio de venta siempre.
  6. Dashboard (`apps/core/views/dashboard.py`): `draft_purchases` ya depende de
     `view_purchases`, así que INVENTORY deja de verlo automáticamente. Verificar en el frontend.
- **Usos a revisar:** todos los `canRead*` y `canWrite*` de Suppliers, Purchases e
  InventoryCounts (`grep -rn "canReadPurchases\|canWritePurchases\|canReadSuppliers\|canWriteSuppliers\|canReadInventoryCounts\|canWriteInventoryCounts" frontend/src`);
  `NAVIGATION_ITEMS`; los tests de
  permisos de `apps/inventory/tests/test_*_permissions.py`, que hoy **esperan** que INVENTORY pueda
  comprar y contar (hay que actualizarlos: son el contrato viejo, no un bug), y `apps/core/tests.py`
  (el conteo pasa de 37 a 38, más la matriz).
- **Tests:** INVENTORY → 403 en compras, proveedores, conteos y `product-cost-history`; 200 en
  productos y ubicaciones; `latest_suggested_price` es `null` para INVENTORY y tiene valor para
  ADMIN; `effective_sale_price` sigue visible para INVENTORY.
- **Migración:** sí, una `AlterModelOptions` en `apps/core/migrations/` por el permiso nuevo
  (aditiva, sin riesgo para datos). Además, `setup_roles` reasigna los grupos en la próxima
  actualización (quita permisos a INVENTORY: es un cambio de acceso, no de datos).

### Punto 14. En ventas, solo el precio de venta, sin nada extra

- **Estado verificado:** `sale-item-form.tsx:178` pide `getLatestProductCostHistory` y
  `priceReferenceHint` (`:267`) muestra "Referencia: último precio sugerido ₡X (compra del
  AAAA-MM-DD)", que filtra información de compras. El buscador de productos de la venta también
  recibe `latest_suggested_price` en la respuesta de `/api/inventory/products/`.
- **Cambio propuesto:** se resuelve con el punto 13 (el serializer oculta el sugerido) y el punto
  17/23 (la venta usa `effective_sale_price` y deja de consultar el historial de costos). El
  formulario de línea de venta muestra solo: producto, disponible, cantidad y precio de venta.
- **Usos a revisar:** `getLatestProductCostHistory` de `features/sales/api.ts` (`:170`): después
  del cambio, verificar con grep si sigue teniendo usos; si no, borrarlo.
- **Tests:** los del punto 13; `lint` y `build`.
- **Migración:** no.

### Punto 15. Proforma: impuesto personalizable y descuento

- **Estado verificado:** `ProformaPdfView` (`apps/documents/views.py`) recibe `product_ids` y un
  `customer_id` opcional; `build_proforma_pdf` (`pdf.py:421`) arma filas (código, nombre,
  `effective_sale_price`) y `_build_itemized_document_pdf` (`pdf.py:288`) suma un TOTAL. **No hay
  cantidades por línea** (un precio por producto), ni impuesto ni descuento. El formulario es
  `features/inventory/products/proforma-form.tsx` (solo cliente), abierto desde
  `app/inventory/products/page.tsx`. La proforma no se guarda en la base de datos.
- **Decisión:** descuento al documento (monto o %) y luego impuesto (%) sobre el subtotal con
  descuento; si están en cero, no aparecen (sección 3).
- **Cambio propuesto:**
  1. Una función pura de cálculo compartida (por ejemplo, `apps/core/money.py` →
     `compute_document_amounts(subtotal, discount_type, discount_value, tax_percentage)` →
     `{subtotal, discount_amount, taxable_base, tax_amount, total}`, con redondeo `ROUND_HALF_UP` a
     2 decimales y validación de que el descuento no supere el subtotal). **La misma función la
     usan los puntos 19 y 26.**
  2. `ProformaPdfView`: aceptar `discount_type` (`AMOUNT` | `PERCENT`), `discount_value`,
     `tax_percentage` (opcionales, 0 por defecto) y validarlos con un serializer.
  3. `_build_itemized_document_pdf`: agregar un parámetro opcional `summary=None` que, si viene,
     pinte las líneas Subtotal / Descuento / Impuesto (X%) / TOTAL, omitiendo las que valen cero.
     **Esta función también la usa `build_sale_invoice_pdf`**: con `summary=None`, el
     comportamiento debe quedar idéntico (los tests actuales de factura de venta deben pasar sin
     cambios).
  4. Frontend `proforma-form.tsx`: campos Descuento (selector Monto/% y valor) e Impuesto (%), con
     vista previa del total.
- **Dudas:** PREGUNTAR si la proforma debe tener cantidad por producto (hoy no tiene: el total es
  la suma de precios unitarios). PREGUNTAR si el impuesto trae un valor por defecto (por ejemplo,
  13% IVA) o empieza en 0.
- **Tests:** `apps/documents/tests.py`: proforma con descuento en monto, en porcentaje, con
  impuesto, con todo en cero (sin líneas extra: se puede verificar la función de cálculo por
  separado, porque leer el texto del PDF es frágil), descuento mayor al subtotal → 400, porcentaje
  > 100 → 400. Tests unitarios de `compute_document_amounts`.
- **Migración:** no.

### Punto 16. Genérico con código propio y ubicación personalizable

- **Estado verificado:** `ProductViewSet.add_variant` (`apps/inventory/views/product.py:305`)
  **fuerza** `standard_code=parent.standard_code` y `storage_location=parent.storage_location`;
  `ProductVariantCreateSerializer` (`serializers/product.py:253`) no tiene esos campos (el docstring
  lo explica: la familia se agrupa por `standard_code`, ver `variant_family()` en
  `selectors/products.py`). `ProductSerializer.validate` ya **no** impide cambiar la ubicación de
  una variante después de creada (el comentario explica por qué se quitó esa regla). La migración
  legacy (`migrate_legacy_equivalences.py`) guarda el código propio de cada pieza agrupada **dentro
  de `description`**, con el prefijo "Código legacy: ".
- **Decisión:** código propio **adicional**; el genérico sigue en la familia del código universal
  (sección 3). La ubicación viene por defecto del padre, pero se puede personalizar.
- **Cambio propuesto:**
  1. Campo nuevo `Product.own_code` (`CharField(max_length=<igual que standard_code>,
     blank=True, db_index=True)`), normalizado a mayúsculas como `standard_code`. PREGUNTAR si debe
     ser único entre productos (se recomienda único cuando no está vacío, con
     `UniqueConstraint(condition=~Q(own_code=""))`).
  2. `ProductVariantCreateSerializer`: agregar `own_code` (opcional) y `storage_location`
     (opcional; si no viene, la vista usa la del padre; si viene, validar que esté activa, como en
     `ProductSerializer.validate_storage_location`). `standard_code` se sigue heredando siempre.
  3. `ProductSerializer`: exponer y permitir editar `own_code`.
  4. Búsqueda: `ProductViewSet.get_queryset` (filtro `q`) y `apps/core/views/search.py`
     (`search_products`) también buscan en `own_code`. Mismo cambio en cualquier otro buscador de
     productos (grep `standard_code__icontains`).
  5. Etiquetas (`services/product_labels.py`) y PDFs: PREGUNTAR si la etiqueta o la proforma deben
     mostrar el código propio.
  6. Frontend: `product-variant-form.tsx` (campos "Código propio" y "Ubicación", esta última con la
     del padre precargada), `product-form.tsx`, la lista y el detalle de producto (mostrar el código
     propio junto al universal).
  7. Legacy: PREGUNTAR si se quiere mover "Código legacy: X" de `description` a `own_code` (sería
     un cambio en `migrate_legacy_equivalences.py` más una migración de datos; **no** hacerlo sin
     confirmación).
- **Usos a revisar:** `variant_family` (sin cambios: sigue agrupando por `standard_code`); tests de
  `add_variant` en `apps/inventory/tests/test_product_api.py` y `test_products_permissions.py`
  (el test que asegura que la ubicación se hereda debe seguir pasando cuando no se envía
  ubicación); `apps/legacy_migration/tests/`.
- **Tests:** variante con código propio y ubicación distinta; variante sin ellos (hereda todo);
  código propio duplicado → 400 (si se decide único); ubicación inactiva → 400; la búsqueda por
  código propio encuentra el producto.
- **Migración:** sí, `AddField` aditiva (default `""`), sin riesgo; más la restricción de unicidad
  si se decide.

### Punto 17 + 23. La venta usa el precio de venta elegido (manual) y no el sugerido; precargado, editable y con botón "usar precio"

- **Estado verificado:** `sale-item-form.tsx`: el precio unitario arranca **vacío**
  (`EMPTY_SALE_ITEM_FORM_VALUES.unitPrice = ""`); al elegir un producto **no se precarga nada**;
  el hint muestra el **último precio sugerido** (historial de costos), **ignorando**
  `product.custom_sale_price` / `product.effective_sale_price`, que el objeto `Product` ya trae en
  el buscador (`ProductSerializer`). La validación (`sale-item-validation.ts`) exige un precio > 0.
  El precio "correcto" ya existe en el backend: `effective_sale_price` = `custom_sale_price` si
  existe, si no el último sugerido en colones (`apps/inventory/selectors/pricing.py`).
  Referencia de patrón: servicios ya tiene el botón "Usar precio sugerido"
  (`features/services/service-price-form.tsx`).
- **Cambio propuesto:**
  1. Al seleccionar un producto (`selectProduct`), si `unitPrice` está vacío, precargar
     `product.effective_sale_price` (si no es null).
  2. Hint: "Precio de venta: ₡X" (el efectivo), **sin** mencionar compras ni el sugerido (punto 14).
  3. Botón "Usar precio de venta" que vuelve a poner `effective_sale_price` (mismo patrón visual que
     servicios).
  4. Al enviar con el precio en blanco, usar `effective_sale_price` (validación: si queda en blanco
     y no hay precio efectivo → error "Este producto no tiene precio de venta; ingrese uno").
     Nunca guardar 0.
  5. Dejar de llamar a `getLatestProductCostHistory` desde este formulario.
  6. **Backend (defensa):** en `SaleItemSerializer`, si `unit_price` no viene, completarlo con
     `effective_sale_price(product)`; si tampoco existe → 400. Hoy `unit_price` es obligatorio
     (hacerlo `required=False` solo en create).
- **Usos a revisar:** `SaleItemForm` solo se usa en `app/sales/[id]/page.tsx:980` (modo create y
  edit; en edit no hay `selectedProduct`, así que no se precarga nada: correcto).
  `EMPTY_SALE_ITEM_FORM_VALUES` y `buildSaleItemWritePayload` (`features/sales/types.ts`).
- **Tests:** backend: crear una línea sin `unit_price` usa el `custom_sale_price`; sin custom usa el
  sugerido en CRC; sin ninguno → 400; con `unit_price` explícito se respeta. Frontend: `lint` y
  `build`, más prueba manual.
- **Migración:** no.

### Punto 18. Cierre de caja: impuestos como rubro aparte

- **Depende de 19 y 26.** Hoy `CashClosing` guarda el esperado por método de pago
  (`expected_cash/card/transfer/other`) y `expected_total`, a partir de `quantity * unit_price`
  (ventas) y `Sum("price")` (servicios) (`apps/cash/selectors.py`).
- **Cambio propuesto:** cuando ventas y servicios tengan montos guardados (subtotal, descuento,
  impuesto, total; ver 19 y 26), los selectores suman `total` (lo que realmente se cobró) por
  método, y además `tax_total` y `discount_total` de la semana. `CashClosing` recibe campos
  congelados nuevos `expected_tax` (y `expected_discount` si se quiere mostrar; PREGUNTAR). El
  `preview`, el serializer y la pantalla (`app/cash/[id]/page.tsx`, `cash-closing-form.tsx`)
  muestran "Impuestos cobrados" como rubro aparte (informativo: **ya está incluido** en el total
  por método).
- **Usos a revisar:** `expected_totals_by_method`, `expected_total`, `create_cash_closing`,
  `CashClosingViewSet.preview`, `CashClosingSerializer` y los tipos `CashClosing` y
  `CashClosingPreview` del frontend.
- **Tests:** una semana con ventas y servicios con impuesto → `expected_tax` correcto; el total por
  método incluye el impuesto y resta el descuento.
- **Migración:** sí, `AddField` con `default=Decimal("0")` (aditiva; los cierres viejos quedan con
  impuesto 0, que es lo correcto porque antes no existía el impuesto).

### Punto 19. Ventas con impuesto y descuento

- **Estado verificado:** `Sale` (`apps/sales/models/sale.py`) no tiene campos de impuesto ni de
  descuento; el total se calcula en 6 lugares (sección 1.4).
- **Decisión:** al documento completo (sección 3).
- **Cambio propuesto:**
  1. `Sale`: `discount_type` (`AMOUNT`/`PERCENT`, por defecto `AMOUNT`), `discount_value`
     (Decimal, 0), `tax_percentage` (Decimal, 0), editables solo en `DRAFT` (el `validate` actual
     de `SaleSerializer` ya bloquea editar ventas no borrador).
  2. Montos **congelados al confirmar**: `subtotal_amount`, `discount_amount`, `tax_amount`,
     `total_amount` (nulos mientras está en borrador), calculados en `confirm_sale` con
     `compute_document_amounts` (punto 15). Así los agregados (caja y reportes) pueden usar
     `Sum("total_amount")` en SQL, en vez de recalcular venta por venta.
  3. `SaleSerializer.total`: en borrador, se calcula en vivo con la misma función; confirmada,
     devuelve el congelado. Exponer también subtotal, descuento e impuesto.
  4. Actualizar **los 6 lugares** de la sección 1.4. Criterio para `TopSellingProductsReportView`
     (es por producto): PREGUNTAR si "total vendido por producto" debe prorratear el descuento del
     documento o seguir mostrando `quantity * unit_price` (bruto). Se recomienda bruto, con una
     columna que lo diga.
  5. Factura PDF (`build_sale_invoice_pdf`): pasar `summary` (ver punto 15).
  6. Frontend: en `app/sales/[id]/page.tsx` (borrador), editar descuento e impuesto (en
     `sale-form.tsx` o en un bloque aparte en el detalle), y mostrar Subtotal / Descuento / Impuesto
     / Total.
- **Datos existentes:** migración de datos que llene `subtotal_amount = total_amount = suma de
  líneas` y descuento e impuesto en 0 para las ventas ya confirmadas (dev; explicar antes de
  correrla).
- **Tests:** cálculo en borrador; congelado al confirmar; editar descuento en una venta confirmada
  → 400; descuento mayor al subtotal → 400; cierre de caja y reportes usan el total con descuento e
  impuesto; la factura se genera.
- **Migración:** sí: `AddField` × 7 (aditiva) más una migración de datos (`RunPython`, reversible
  con noop).

### Punto 20. Reporte de ventas desglosado (impuesto y demás) para comparar períodos

- **Depende de 19 (y de 26 si incluye servicios).** Hoy `SalesByDateReportView` da cantidad de
  ventas y total por día, sin desglose.
- **Cambio propuesto:** reporte nuevo `GET /api/reports/sales-summary/` con `date_from`,
  `date_to` y `group_by` (`day`/`week`/`month`), que devuelve por período: cantidad de documentos,
  subtotal, descuentos, base imponible, impuestos, total y total por método de pago; más un
  resumen del rango. Comparar períodos: parámetros opcionales `compare_from` y `compare_to`, que
  devuelven el mismo resumen del período de comparación y la variación (monto y %). Pantalla
  nueva en `app/reports/sales-summary/page.tsx` y tarjeta en `app/reports/page.tsx`. Con PDF (punto
  2).
- **Dudas:** PREGUNTAR si incluye servicios de inyectores (se recomienda: sí, en columnas o filas
  separadas "Ventas" / "Servicios" / "Total"), y si cuenta por `sale_date` (ventas) y
  `delivered_at` (servicios), el mismo criterio que la caja.
- **Tests:** agrupación por día, semana y mes; montos correctos con descuento e impuesto; ventas
  anuladas o en borrador excluidas; comparación.
- **Migración:** no.

### Puntos 21 + 22. Fondo de caja chica, salidas y desglose al cierre

- **Estado verificado:** no existe nada de caja chica. `apps/cash` solo tiene `CashClosing`.
- **Decisión:** ver la sección 3.
- **Cambio propuesto:**
  1. Modelo `PettyCashMovement` (`apps/cash/models.py`): `date` (DateField), `amount` (> 0),
     `reason` (obligatorio), `AuditModel`. Solo salidas.
  2. `CashClosing`: campos nuevos `petty_cash_opening` (fondo inicial de la semana, congelado),
     `petty_cash_outflows` (suma de salidas de la semana, congelada), `petty_cash_balance`
     (opening − outflows) y `next_petty_cash_opening` (lo define el usuario al cerrar: es el fondo
     inicial de la semana siguiente).
  3. El fondo inicial de una semana = `next_petty_cash_opening` del cierre anterior. Si no hay
     cierre anterior (primer uso), el formulario de cierre pide el fondo inicial a mano.
  4. **Efectivo físico esperado** = `expected_cash` (ventas y servicios en efectivo) +
     `petty_cash_balance`. Hoy `counted_total` es **un solo número** para los 4 métodos (decisión
     del 2026-09-09). Con caja chica, `difference = counted_total − (expected_total +
     petty_cash_balance)`. **Confirmar con Alejandro al empezar el punto** que el contado incluye el
     efectivo del fondo, y ajustar los textos de la pantalla para que quede claro.
  5. No se pueden registrar ni borrar salidas en una semana ya cerrada (validar en el servicio).
  6. API: `PettyCashMovementViewSet` (crear, listar por semana, borrar solo si la semana no está
     cerrada), con `CashPermission`. `preview` devuelve también el fondo inicial, las salidas y el
     saldo.
  7. Frontend: sección "Caja chica" en `app/cash/` (lista de salidas de la semana en curso y
     formulario "Registrar salida"), y el desglose en el cierre y en su detalle.
- **Usos a revisar:** `create_cash_closing`, `preview`, `CashClosingSerializer`,
  `pending_closing_week_start` (sin cambios), tipos del frontend, y el cierre del punto 18 si ya
  está hecho.
- **Tests:** saldo = fondo − salidas; efectivo esperado; diferencia con fondo; salida en semana
  cerrada → 400; el fondo inicial se hereda del cierre anterior; primer cierre sin cierre anterior.
- **Migración:** sí: `CreateModel` más `AddField` × 4 con default 0 (aditiva).

### Punto 24. Botones de servicios al final de la pantalla, como en compras

- **Estado verificado:** en `app/services/[id]/page.tsx`, Iniciar / Marcar listo / Entregar /
  Descargar factura / Anular / Volver están en `actions` del `AppShell` (el encabezado). En
  compras, "Confirmar compra" está al final (`app/inventory/purchases/[id]/page.tsx` ~1055, botón
  de ancho completo con su `FormError` encima, fuera del encabezado). En ventas, "Confirmar venta"
  también está en el encabezado (`app/sales/[id]/page.tsx:681`), pero el punto solo habla de
  servicios.
- **Cambio propuesto:** mover las transiciones de estado (Iniciar, Marcar listo, Entregar) a un
  bloque al final de la página, con el mismo estilo de compras (ancho completo, `variant="primary"`,
  error de `transitionState.error` justo encima). PREGUNTAR si "Anular" y "Descargar factura" se
  mueven también o se quedan arriba (se recomienda dejar "Volver" arriba y mover el resto). Solo
  mover el JSX: la lógica (`runTransition`, `hasWriteAccess`, `hasCancelAccess`) no cambia.
- **Dependencia con 25:** después del punto 25, "Entregar" se muestra solo al Administrador.
- **Tests:** `lint`, `build` y prueba manual de cada estado.
- **Migración:** no.

### Punto 25. El operario no maneja el precio de los servicios (solo el Administrador)

- **Estado verificado:** el precio, el tipo de servicio y el método de pago se editan con PATCH al
  servicio (`InjectorServiceRecordViewSet.perform_update`, `ServicesPermission` →
  `change_services`, que CUSTOMERS tiene). El catálogo de tipos de servicio y sus precios
  (`ServiceTypeViewSet`) también usa `ServicesPermission`. Entregar (`deliver`) requiere
  `change_services`. Frontend: `ServicePriceForm` se muestra si `canManage`
  (`app/services/[id]/page.tsx:192`).
- **Decisión:** solo ADMIN define precio y tipo, y entrega (sección 3).
- **Cambio propuesto:**
  1. Backend, `InjectorServiceRecordSerializer.validate`: si el request cambia `price`,
     `service_type` o `payment_method` y el usuario no es admin (superusuario o grupo ADMIN), → 403
     o 400 con un mensaje claro. Mejor aún: permiso nuevo `price_services` ("Servicios: definir
     precio y entregar"), solo para ADMIN, para no fijar la regla al nombre del grupo (sigue el
     patrón de permisos de módulo; implica migración y el conteo en `apps/core/tests.py`). PREGUNTAR
     cuál de las dos opciones prefiere.
  2. `deliver`: exigir ese permiso (agregar `"deliver"` a una lista de acciones que resuelvan a ese
     permiso; hoy `ModulePermission._codename` no tiene ese mecanismo, así que se necesita una
     subclase de `ServicesPermission` con `_codename` extendido o una comprobación en la acción).
  3. `ServiceTypeViewSet`: crear y editar tipos (y sus precios) → ese mismo permiso; lectura →
     `view_services`.
  4. Frontend: `canPriceServices(user)` en `permissions.ts`; el formulario de precio y el botón
     Entregar solo se muestran con ese permiso; el operario ve el precio en solo lectura (PREGUNTAR
     si el operario debe **ver** el precio o no verlo del todo, y lo mismo con los precios de los
     accesorios, que hoy expone `InjectorServiceAccessorySerializer.product_detail.effective_sale_price`).
- **Usos a revisar:** `sync_service_type_price_history` (se llama en `perform_update`; sin cambios);
  los tests de `apps/customers/tests/test_services_permissions.py` y
  `test_service_type_api.py` (hoy esperan que CUSTOMERS pueda editar el precio y entregar: son el
  contrato viejo, hay que actualizarlos).
- **Tests:** CUSTOMERS puede iniciar y marcar listo; no puede cambiar precio, tipo ni método de
  pago, ni entregar; ADMIN sí puede.
- **Migración:** solo si se crea el permiso nuevo (`AlterModelOptions`, aditiva).

### Punto 26. Factura de servicio con impuesto y descuento

- **Depende de 15 (función de cálculo) y de la regla de 19.** Hoy `InjectorServiceRecord.price` es
  **el total completo** (mano de obra + accesorios, por diseño del 2026-09-09) y
  `build_service_invoice_pdf` (`pdf.py:465`) pinta un solo monto.
- **Cambio propuesto:** mismos campos que la venta (`discount_type`, `discount_value`,
  `tax_percentage`, más los montos congelados al **entregar**, en `deliver_service`), con `price`
  como subtotal. `services_total_by_method` (caja) pasa a sumar `total_amount`. El PDF pinta
  Subtotal / Descuento / Impuesto / Total (omitiendo los ceros). Solo el ADMIN los edita (punto 25).
- **Usos a revisar:** `deliver_service` (valida el precio no nulo; mantenerlo),
  `services_total_by_method`, `ServicePriceForm`, la pantalla de detalle (bloque "Precio del
  servicio"), `sync_service_type_price_history` (registra `price`, el subtotal: correcto, no
  cambiarlo).
- **Datos existentes:** migración de datos para servicios ya entregados: `total_amount = price`,
  impuesto y descuento en 0.
- **Tests:** análogos a los de 19, más: la caja suma el total con impuesto de los servicios.
- **Migración:** sí, aditiva, más datos.

### Punto 27. Opción de imprimir en todos los reportes, intuitiva, con espacios para llenar a mano

- **Junto con el punto 2.** Botón "Imprimir" al lado de "Descargar PDF" en cada reporte: pide el
  mismo PDF y lo abre para imprimir (en Electron, abrir el blob en una ventana o pestaña nueva
  muestra el visor de PDF de Chromium, que tiene su propio botón de imprimir; verificarlo en la
  máquina Windows, porque es el entorno real). "Espacios para llenar a mano": el parámetro
  `blank_rows` del generador (filas vacías al final de la tabla) y un recuadro al pie con
  "Revisado por: ____  Fecha: ____  Observaciones: ____".
- **Dudas:** PREGUNTAR en qué reportes van las filas en blanco (por ejemplo, Bajo mínimo con una
  columna "Cantidad a pedir" vacía, Stock por ubicación con una columna "Conteo físico" vacía) y
  si todos llevan el recuadro de firma.

### Punto 28. Exportar el reporte de movimientos a Excel y ver los productos que más se mueven

- **Estado verificado:** la pantalla Movimientos usa `/api/inventory/stock-movements/`
  (`StockMovementViewSet`, `MovementsPermission`, con filtros `product`, `location`,
  `movement_type`, `direction`, `date_from`, `date_to`, `purchase`, `sale`, `inventory_count`,
  paginado). No hay exportación ni ranking de productos por movimiento. `openpyxl` **no** está
  en `backend/requirements/base.txt`.
- **Decisión:** `.xlsx` con `openpyxl` (sección 3).
- **Cambio propuesto:**
  1. Agregar `openpyxl==<versión fija>` a `backend/requirements/base.txt`. Confirmar que se
     instala en las imágenes (`backend/Dockerfile`, `Dockerfile.prod`) y que
     `scripts/build-offline-release.sh` la incluye (la imagen se construye con internet en la Mac,
     así que el release offline la lleva adentro; verificarlo).
  2. `@action(detail=False, url_path="export")` en `StockMovementViewSet` que aplique **los mismos
     filtros** (reusar `get_queryset`; con `detail=False` y GET resuelve a `view_movements`) y
     devuelva un `.xlsx` (fecha en la zona de Costa Rica, código, producto, ubicación, tipo, cantidad
     con signo, origen, usuario, notas). Poner un límite de filas razonable y avisar si se trunca.
  3. "Productos que más se mueven": endpoint nuevo `GET /api/inventory/stock-movements/top-products/`
     (o un reporte en `apps/core/views/reports.py`: PREGUNTAR, porque de eso depende qué permiso
     aplica, `view_movements` o `view_reports`), que agrupe por producto en el rango de fechas:
     entradas, salidas, total movido y cantidad de movimientos, ordenado por total. Excluir los
     `REVERSAL` o compensarlos (PREGUNTAR; se recomienda neto: salida − reversión de salida). Con
     su propia exportación a Excel.
  4. Frontend: botón "Exportar a Excel" en `app/inventory/movements/page.tsx` con los filtros
     vigentes, y una pestaña o sección "Más movidos".
- **Tests:** el export responde con el content-type de xlsx, respeta los filtros y los permisos
  (READ_ONLY sí, usuario sin permiso → 403); se puede abrir con `openpyxl.load_workbook` y las
  filas coinciden. El ranking con datos conocidos.
- **Migración:** no.

### Punto 29. Al eliminar un ítem de una compra con costos ya calculados, borrar el cálculo

- **Estado verificado:** `PurchaseItemViewSet.destroy` (`apps/inventory/views/purchase.py:324`)
  solo permite borrar en `DRAFT` y borra la línea; **no toca `ProductCostHistory`** de esa compra.
  `calculate_purchase_costs` (`services/costs.py`) **no valida el estado** (se puede calcular en
  borrador) y cada vez **crea filas nuevas** (no reemplaza las anteriores). Consecuencias: queda
  el historial de un producto que ya no está en la compra, y `latest_suggested_price` /
  `effective_sale_price` de ese producto siguen usando ese cálculo. En el frontend,
  `PurchaseCostsSection` (`purchase-costs-section.tsx`) mantiene en memoria `summaryState.result`
  y `historyState` después de borrar la línea (el detalle de compra no le avisa).
- **Cambio propuesto:**
  1. Backend: en `PurchaseItemViewSet.destroy`, dentro de una transacción, borrar
     `ProductCostHistory.objects.filter(purchase=purchase)` (todas las filas de la compra, no solo
     la del producto borrado, porque el factor de costo depende de toda la factura) y después la
     línea. Devolver en la respuesta (o documentar) que se reinició el cálculo.
     Mejor como servicio `delete_purchase_item(item, user)` en `services/purchases.py`.
  2. Frontend: después de `deletePurchaseItem` en `app/inventory/purchases/[id]/page.tsx:420`,
     forzar que `PurchaseCostsSection` recargue y limpie el resumen. La forma más quirúrgica es un
     `key` que cambie (por ejemplo, `key={costsReloadKey}` que se incrementa al borrar), para que el
     componente se vuelva a montar con el estado en blanco. Mostrar un aviso "Se borraron los costos
     calculados; vuelva a calcularlos."
- **Usos a revisar:** `ProductCostHistory` tiene `on_delete=PROTECT` hacia `Purchase`, no hacia la
  línea, así que borrar el historial primero es seguro. `latest_suggested_price` (en
  `pricing.py`) pasa a tomar el cálculo anterior del producto, si existe: es el comportamiento
  correcto. PREGUNTAR si también debe reiniciarse el cálculo al **agregar** una línea, al **editar**
  cantidad o costo, o al cambiar los costos de importación (se recomienda sí, por la misma razón,
  pero no se pidió).
- **Tests:** `apps/inventory/tests/test_purchase_api.py`: calcular costos, borrar una línea → no
  quedan `ProductCostHistory` de esa compra; el `latest_suggested_price` del producto borrado vuelve
  al valor anterior (o a null); borrar una línea sin costos calculados sigue funcionando; en una
  compra confirmada sigue fallando.
- **Migración:** no.

### Punto 30. Compra en dólares con un costo en dólares: el texto en colones repite el mismo número

- **Estado verificado (bug real, causa exacta):** en `purchase-costs-section.tsx:516-520`, la tabla
  de costos de importación pinta `MoneyCell` con `exchangeRate={importCost.exchange_rate}`. Cuando
  la moneda del costo es igual a la de la compra, el formulario fuerza el tipo de cambio del costo
  a `1` (`import-cost-form.tsx`, al cambiar la moneda; y la validación exige `1`,
  `import-cost-validation.ts:45`), porque ese tipo de cambio sirve para convertir **a la moneda de
  la compra**, no a colones. Entonces, para un costo en USD dentro de una compra en USD,
  `crcEquivalent(monto, 1)` muestra "≈ el mismo número CRC". El resumen de costos sí sale bien
  porque usa `summaryState.result.exchange_rate` (el tipo de cambio de la compra).
- **Cambio propuesto:** pasar el tipo de cambio de la compra a `PurchaseCostsSection` (prop nueva
  `purchaseExchangeRate`, desde `app/inventory/purchases/[id]/page.tsx:1047`, donde ya está
  `loadState.purchase.exchange_rate`), y en la celda del monto usar: si `importCost.currency ===
  "USD"` y `importCost.currency === currency` (la moneda de la compra) → `purchaseExchangeRate`; si
  la compra está en CRC y el costo en USD → `importCost.exchange_rate` (ahí sí son colones por
  dólar). No cambiar nada del backend: el cálculo ya está bien.
- **Usos a revisar:** `PurchaseCostsSection` solo se usa en `app/inventory/purchases/[id]/page.tsx`
  (grep); `MoneyCell` solo existe dentro de ese archivo; `crcEquivalent` también lo usa el detalle
  de producto (sin cambios).
- **Tests:** `lint` y `build`; prueba manual con compra USD + costo USD, compra USD + costo CRC,
  compra CRC + costo USD y compra CRC + costo CRC.
- **Migración:** no.

### Extra (hallazgo del 2026-10-02, al probar el punto 29). Qué compra define el precio de venta

- **Estado verificado (dos bugs reales):** `latest_suggested_price`
  (`apps/inventory/selectors/pricing.py`) tomaba la última fila de `ProductCostHistory` del
  producto **sin mirar el estado de la compra**, y `cancel_purchase` (`services/purchases.py`)
  revierte el stock pero no toca el historial de costos. Consecuencias: aplicar costos en un
  **borrador** ya movía el precio de venta del producto, y al **anular** una compra el producto se
  quedaba con el precio de la factura anulada en vez de volver al de la compra anterior.
- **Decisión de Alejandro:** solo el cálculo de la **última compra confirmada** define el precio
  (y los costos que se muestran en el producto). Mientras la compra esté en borrador no aparece
  nada; al confirmarla aparece; al anularla vuelve el anterior. Sin preguntas ni avisos en
  pantalla: se muestra lo que de verdad rige.
- **Cambio aplicado:** filtro `purchase__status=CONFIRMED` en
  `_cost_history_with_suggested_price_in_crc` (alimenta `latest_suggested_price`,
  `with_latest_suggested_price` y `effective_sale_price`), y parámetro `?purchase_status=` en
  `ProductCostHistoryViewSet` que usan los dos `getLatestProductCostHistory` del frontend
  (producto y venta). El histórico **no se borra**: las filas de borradores y anuladas siguen
  visibles en la pantalla de su compra, solo dejan de definir precio. Arregla los datos existentes
  sin migración, porque es un filtro de consulta.
- **Tests:** `test_product_api.py` (un cálculo de borrador no define precio; con la última compra
  anulada se cae al precio de la anterior), `test_purchase_api.py` (el precio entra al confirmar;
  anular devuelve el precio anterior y conserva el histórico), `test_import_cost_api.py` (el
  filtro nuevo y su validación). El helper `create_cost_history` de `test_product_api.py` creaba
  compras en borrador y hubo que pasarlas a confirmadas.
- **Migración:** no.

---

## 6. Checklist de avance (marcar al hacer commit)

- [x] 30 — Texto en colones en costos de compras USD
- [x] 5 — Texto de is_staff
- [x] 11 — Borrar la migración vacía del frontend
- [x] 10 — Versión del instalador
- [x] 9 — Bloquear semanas futuras en caja (+ lista de semanas por cerrar, sin calendario)
- [x] 8 — Revertir accesorios al anular un servicio
- [x] 29 — Borrar el cálculo de costos al eliminar un ítem de compra (y al agregar o
      editar líneas, y al tocar costos de importación)
- [x] Extra — Solo la última compra **confirmada** define el precio de venta y los costos del
      producto; al anular una compra vuelve el precio anterior (ver sección 5, "Extra")
- [x] 12 — Enlaces en el historial de movimientos (y SERVICE_USE)
- [x] 6 — Movimientos en el menú → **descartado el 2026-10-10 por Alejandro.** No se agrega al
      menú: la pantalla se queda como está, accesible solo desde la tarjeta de Reportes, es decir
      solo para quien tiene `view_reports` (hoy, el Administrador). Consecuencia conocida: los
      roles Inventario y Solo lectura conservan `view_movements` en el backend sin forma de usarlo
      desde la interfaz; revisar al rediseñar los roles (puntos 13 y 4).
- [x] 24 — Botones de servicio al final (solo las transiciones; Anular, Descargar factura y
      Volver se quedan en el encabezado, como en compras)
- [x] 1 — Filtros en cierres de caja
- [x] 3 — Cambio y reseteo de contraseñas (mínimo 8 caracteres; el cambio propio devuelve token
      nuevo y no cierra la sesión; se entra desde el bloque del usuario → /account "Mi cuenta")
- [x] 13 — Inventario sin costos, compras, proveedores ni conteos (permiso `view_costs`, casilla
  "Puede ver costos" en usuarios). Corregido después: el precio de venta solo lo cambia quien ve
  costos, y el resumen de costos de una compra exige `view_costs` (Solo lectura ve la factura y
  los gastos, no el costo final ni el sugerido)
- [x] 4 — Lectura de productos para Ventas y Clientes (sin Productos en su menú). Ventas e
  Inventario también leen clientes (cliente de la venta y de la proforma), sin Clientes en su menú.
  Proformas con cantidades desde Ventas (`/sales/proforma`, `add_documents` para Ventas)
- [x] 14 — Ventas: solo precio de venta
- [x] 25 — Solo el Administrador pone precio y entrega servicios (regla por rol ADMIN, sin permiso
  nuevo; el operario no ve el precio, el método de pago, el importe de los accesorios ni la factura)
- [x] 17 + 23 — Precio de venta precargado y botón "usar precio" (el campo sigue al producto
  mientras no se escriba un precio propio; sin unit_price el backend usa el precio de venta)
- [x] 19 — Impuesto y descuento en ventas (13 % por defecto al crear desde la API; montos
  congelados al confirmar; cálculo compartido en `apps/core/money.py` y `lib/document-amounts.ts`;
  más vendidos sigue en bruto)
- [x] 26 — Impuesto y descuento en servicios y en su factura (mismo cálculo y 13 % que ventas;
  montos congelados al entregar; la caja suma lo cobrado de ventas y servicios; montos congelados
  de solo lectura en el admin de Django)
- [x] 15 — Impuesto y descuento en la proforma (Ventas con resumen en vivo; Productos con los mismos
  campos y los montos en el PDF; 13 % por defecto; cantidades ya existían desde el punto D)
- [x] 18 — Impuestos en el cierre de caja ("De ese dinero": impuestos cobrados para Hacienda,
  ingreso del negocio = total − impuestos, y descuentos dados como dato informativo; fijados al cerrar)
- [x] 20 — Reporte de ventas desglosado y comparativo ("Resumen de ventas" reemplaza a "Ventas por
  fecha"; ventas, servicios y total; semana sábado a viernes; comparación con período anterior, año
  pasado u otro rango; caja y reportes comparten la definición de venta/servicio que cuenta)
- [x] 21 + 22 — Caja chica
- [x] 2 + 27 — PDF e impresión de reportes
- [x] 28 — Movimientos a Excel y productos más movidos
- [x] 16 — Código propio del genérico y ubicación personalizable
- [x] 7 — Menús de Electron: progreso, confirmación y errores claros

## 7. Resumen de dudas pendientes ("PREGUNTAR")

Consultar cada una al empezar su punto, no antes:

1. (2) ¿El detalle de un cierre de caja también necesita PDF?
2. (3) ¿Reglas de contraseña de Django o solo un mínimo de 8? ¿Al cambiar la propia contraseña se
   mantiene la sesión o se pide login nuevo? ¿Dónde va "Cambiar mi contraseña"?
3. (4) ¿Ventas y Clientes ven el menú Productos o solo el buscador dentro de venta y servicio?
4. (5) ¿Corregir el texto de is_staff o esconder la casilla?
5. (6) ¿INVENTORY sigue viendo Movimientos? (Si sí, se ocultan los enlaces a compras).
6. (8) ¿Corregir el stock de servicios ya anulados en dev?
7. (13) ¿READ_ONLY recibe `view_costs`? ¿INVENTORY sigue con proformas y etiquetas
   (`add_documents`)? ¿El precio de venta que cae al sugerido cuenta como precio de venta?
8. (15) ¿La proforma lleva cantidad por producto? ¿Impuesto por defecto 13% o 0?
9. (16) ¿El código propio es único? ¿Se muestra en etiquetas y PDFs? ¿Se migra "Código legacy" de
   la descripción?
10. (18) ¿Mostrar también los descuentos en el cierre?
11. (19) ¿"Productos más vendidos" muestra el bruto o prorratea el descuento?
12. (20) ¿Incluye servicios? ¿Con qué fechas?
13. (21/22) Confirmar que el total contado incluye el efectivo del fondo de caja chica.
14. (24) ¿"Anular" y "Descargar factura" también bajan?
15. (25) ¿Regla por grupo ADMIN o permiso nuevo `price_services`? ¿El operario ve el precio?
16. (27) ¿Qué reportes llevan filas en blanco y cuáles el recuadro de firma?
17. (28) ¿"Más movidos" va en Movimientos (`view_movements`) o en Reportes (`view_reports`)?
    ¿Neto de reversiones?
18. (29) ¿Reiniciar el cálculo también al agregar o editar líneas o costos de importación?
