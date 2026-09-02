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

Las secciones «SSH» y «Operadores» que siguen describen el modelo de seguridad a nivel de sistema operativo pensado originalmente para Linux. Se conservan sin cambios como el estándar de referencia exigido: la sección [Seguridad en Windows](#seguridad-en-windows), más abajo, toma cada uno de esos controles y documenta, verificado contra el código real, cómo se logra (o se mejora) el mismo nivel de protección en la arquitectura Windows/WSL2 + Electron vigente (ver [Despliegue en Windows](../infra/windows/README.md)).

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

## Seguridad en Windows

Esta sección toma cada medida de las secciones anteriores (pensadas para
Linux) y documenta su equivalente real en la arquitectura de producción
vigente: WSL2 (Ubuntu 24.04, distro `lics-wsl`) + Docker Engine dentro de
esa distro + app de escritorio Electron en Windows (ver
[`infra/windows/README.md`](../infra/windows/README.md) y
[`docs/windows-desktop-stage-closure.md`](windows-desktop-stage-closure.md)).
Cada punto está verificado contra el código real, no asumido; donde no se
encontró un equivalente implementado se marca explícitamente como brecha.

### Red

Sin cambios de fondo, y con un endurecimiento adicional confirmado en el
código: en `infra/docker/compose.prod.yml`, Nginx es el único servicio con
`ports:` — y publica `127.0.0.1:${HTTP_PORT:-80}:80`, es decir, **solo en
loopback**, no en todas las interfaces (a diferencia de `infra/docker/compose.yml`,
de desarrollo, que publica `"80:80"` sin restringir la interfaz).
PostgreSQL, backend (Django) y frontend (Next.js) no tienen ninguna
sección `ports:` en `compose.prod.yml`: siguen alcanzables solo por la red
interna de Docker (`networks: application`), exactamente igual que en
Linux — este `compose.prod.yml` corre sin ningún cambio dentro de la distro
WSL2. La propia app Electron (`infra/windows/electron/main.js`) tampoco se
desvía de esto: `APP_URL` y `HEALTH_URL` (en `main.js` y
`infra/windows/electron/lib/backend.js`) apuntan únicamente a
`http://127.0.0.1/...`.

### Acceso remoto (equivalente de SSH)

No hay ningún servidor SSH ni ningún otro puerto de administración remota
en todo el flujo Windows/WSL2/Electron — se revisó explícitamente
(`infra/windows/`, `docs/windows-desktop-stage-closure.md`) y las únicas dos
menciones a "SSH" en esos archivos son comparaciones de prosa con el modelo
Linux anterior (`infra/windows/README.md`, sección "Actualizar la
aplicación"; `docs/windows-desktop-stage-closure.md`, §2), no un mecanismo
real.

Todo el control de la distro se hace exclusivamente invocando `wsl.exe -d
lics-wsl -- ...` **desde el propio proceso Electron corriendo en esa misma
máquina Windows** (`spawnInDistro()` en
`infra/windows/electron/lib/backend.js`), o por una persona físicamente
frente a esa Windows corriendo `wsl -d lics-wsl` a mano. No existe ninguna
vía de red para llegar a ese control — es una mejora real sobre SSH: SSH,
aun con llaves y firewall (como pide la sección "SSH" de arriba), sigue
siendo un demonio expuesto a la red que hay que mantener parcheado y
acotado; acá no hay nada escuchando en la red para administración remota,
punto.

**Actualizaciones**: el menú **LICS > Actualizar aplicación (Django/Next)…**
(`main.js`) es la única forma de llevar cambios de Django/Next a una
instalación existente, y exige una confirmación explícita
(diálogo Cancelar/Actualizar) de alguien sentado frente a esa máquina antes
de llamar a `backend.updateApplication()` →
`resources/windows/update-application.sh` dentro de la distro. No existe
disparo remoto ni automático de ningún tipo. Esto es una mejora concreta
sobre un flujo de actualización por SSH: ahí, en principio, alguien con
acceso de red y la llave correcta podría disparar una actualización sin
estar presente; acá hace falta estar físicamente en la máquina y confirmar
el diálogo.

`restore.sh` y `rollback.sh` (los procedimientos destructivos) siguen sin
exponerse en el menú de Electron, a propósito, igual que en Linux — siguen
siendo manuales, con confirmación escrita, corriendo dentro de WSL2. La
diferencia con el modelo Linux es que ahora se invocan localmente (`wsl -d
lics-wsl -- sudo bash /opt/lics/scripts/restore.sh`) en vez de por SSH: al
no existir SSH en absoluto, esto es al menos equivalente y, en la práctica,
más restrictivo — exige presencia local en la máquina de producción, no
solo credenciales de red.

### Separación de usuarios (equivalente de "Operadores")

**Brecha identificada: no hay separación de usuarios, ni en WSL2 ni en
Windows.** Verificado en el código, no es un supuesto:

- `infra/windows/wsl/provision-golden-image.sh` lo dice explícitamente en
  un comentario: la distro "corre como root (no crea un usuario operativo
  separado: esta distro es un 'appliance' de un solo propósito, no una
  estación de trabajo interactiva)".
- `infra/windows/wsl/build-golden-image.ps1` configura `wsl.conf` con
  `[user]` / `default=root` — el usuario por defecto de toda la distro
  `lics-wsl` es root.
- Del lado Windows, las dos tareas programadas que registra
  `register-scheduled-task.ps1` corren con principal `RunLevel Limited`
  (SID `S-1-5-32-545`, `BUILTIN\Users`) disparadas al inicio de sesión de
  **cualquier** usuario de esa Windows — no hay una cuenta Windows
  dedicada y separada para operar LICS; corre bajo la sesión de quien
  inicie sesión en esa computadora.

Esto no es peor que el modelo Linux: era exactamente el mismo pendiente
documentado más abajo, en "Controles pendientes" ("Usuario operativo del
sistema operativo", "Usuario técnico separado"), y sigue sin resolverse acá
tampoco. La migración a Windows no lo empeoró ni lo arregló — lo dejó
igual de pendiente. Queda como decisión del negocio si vale la pena
resolverlo dado que LICS sigue siendo una computadora dedicada de un solo
propósito.

### systemd (unidades productivas): sigue siendo la base, no fue reemplazado

`lics.service`, `lics-backup.service`/`.timer` y `lics-watchdog.service`/`.timer`
**siguen corriendo, sin modificar, dentro de la distro WSL2** — no fueron
reemplazados por la tarea programada de Windows. `provision-golden-image.sh`
los instala al construir la imagen dorada
(`install_systemd_units()`, que llama a `install-systemd.sh`,
`install-backup-timer.sh` e `install-watchdog-timer.sh`), y funcionan
porque WSL2 corre un systemd real dentro de la distro (`systemd=true` en
`wsl.conf`, confirmado en `build-golden-image.ps1`). El respaldo diario
(`lics-backup.timer`, `OnCalendar=*-*-* 03:00:00`, `Persistent=true`) y el
watchdog de autocuración (`lics-watchdog.timer`, cada 2 minutos) son
exactamente los mismos que en Linux, corriendo por la misma vía.

La tarea programada de Windows (`register-scheduled-task.ps1`) **no
sustituye** a systemd — resuelve un problema distinto y específico de
WSL2: por sí sola, WSL2 apaga toda la distro (systemd incluido) segundos
después de arrancar si ningún proceso `wsl.exe` queda conectado como
cliente (investigado y confirmado en
`docs/windows-desktop-stage-closure.md`, §9-10). La tarea "LICS - Iniciar
backend" solo dispara `start.sh` al iniciar sesión en Windows, y "LICS -
Mantener sesion WSL activa" mantiene un cliente `wsl.exe` conectado de
forma indefinida para que WSL2 no apague la distro; el trabajo real
(arrancar servicios, respaldar, vigilar) lo sigue haciendo systemd adentro,
sin cambios.

Excepción notable: `lics-kiosk.service` (el modo kiosco de Chromium,
pensado para el plan original de Ubuntu Desktop/Linux Mint) **no se instala
en ningún lado del flujo Windows** — `install_systemd_units()` no lo
incluye. Es vestigial en esta arquitectura: la app Electron reemplaza
funcionalmente al modo kiosco (ventana nativa normal, sin Chromium en
pantalla completa, ver `infra/windows/README.md`, "Decisión de
arquitectura").

### Backups y restauración

Sin cambios respecto a Linux: el timer y el servicio de respaldo automático
corren dentro de WSL2 sin modificarse (ver arriba). La restauración
(`restore.sh`, `rollback.sh`) sigue siendo manual, con confirmación
escrita, y ahora se dispara localmente vía `wsl -d lics-wsl` en vez de por
SSH — nunca desde la interfaz de Electron, nunca por una vía de red. Quien
puede restaurar es exactamente quien tiene acceso físico/local a esa
computadora Windows, ni más ni menos que antes; al no existir SSH en este
modelo, no hay una superficie de red adicional que asegurar para este
punto en particular.

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