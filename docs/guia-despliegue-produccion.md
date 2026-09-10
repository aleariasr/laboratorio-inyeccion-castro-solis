# Guía: llevar esta versión a producción (con migración legacy DBF)

Esta es una guía operativa paso a paso, pensada para vos, para llevar la
versión actual (con la migración legacy DBF ya implementada y probada) a
la máquina de producción del cliente. No reemplaza la documentación de
referencia — en cada paso te digo dónde está el detalle completo si algo
no sale como se espera.

Documentos de referencia usados acá:

- [infra/windows/README.md](../infra/windows/README.md) — proceso completo de imagen dorada e instalación.
- [dbf-migration-closure.md](dbf-migration-closure.md) — qué hace la migración legacy y por qué.
- [windows-production-checklist.md](windows-production-checklist.md) — checklist de producción vigente.
- [troubleshooting.md](troubleshooting.md) — si algo falla en cualquier paso.

---

## Paso 0 — Commitear todo (obligatorio, sin esto no sirve de nada lo demás)

`build-offline-release.sh` arma el paquete de instalación con `git archive
HEAD` — **solo incluye lo que está commiteado**, y además se niega a correr
si el repo tiene cambios sin commit (`git status` debe estar limpio). Si
saltás este paso, el release ni siquiera va a contener la app de migración
legacy nueva.

```bash
git status
```

Revisá la lista (vas a ver el `Makefile`, `README.md`, varios `docs/*.md`,
`scripts/migrate-legacy-dbf.sh` y algunos archivos de
`backend/src/apps/legacy_migration/`), y commiteá todo lo de esta sesión.
Esto lo hacés vos — yo no corro `git add`/`git commit`.

Después confirmá que quedó limpio:

```bash
git status
# tiene que decir "nothing to commit, working tree clean"
```

**(Opcional, recomendado)** Subir la versión del proyecto, ya que esta
release incluye una capacidad nueva completa (Fase 10 del roadmap):

```bash
echo "2.2.0" > VERSION
git add VERSION
git commit -m "chore: bump version to 2.2.0 (migración legacy DBF)"
```

---

## Paso 1 — Generar el release offline (en la Mac / máquina de build)

```bash
./scripts/build-offline-release.sh
```

Esto:

- valida que el repo esté limpio (por eso el Paso 0 es obligatorio);
- construye las imágenes Docker productivas (`linux/amd64`);
- genera `release/lics-<versión>-linux-amd64/` con la app completa (incluye
  `scripts/migrate-legacy-dbf.sh` y `apps.legacy_migration` porque ya están
  commiteados) más las 4 imágenes exportadas y checksums.

Pasá esa carpeta completa a la Windows de producción (USB, red, lo que
uses) a:

```
C:\lics-dev\lics-2.2.0-linux-amd64\
```

---

## Paso 2 — Generar la imagen dorada y el instalador `.exe` (en la Windows)

Con la carpeta de release ya copiada a `C:\lics-dev\`:

```powershell
cd infra\windows\wsl
.\cut-release.ps1
```

Esto reconstruye la imagen dorada (`build-golden-image.ps1` por dentro,
que a su vez corre `provision-golden-image.sh`: instala Docker Engine
dentro de WSL2, copia la app, carga las 4 imágenes, genera `.env.prod`
con contraseñas aleatorias, corre migraciones, **crea el administrador
inicial con contraseña aleatoria**, instala los timers de systemd) y, si
tenés `gh` (GitHub CLI) logueado, dispara el workflow de Actions en el
runner self-hosted y espera el `.exe`.

Si no tenés `gh` configurado: la imagen dorada queda lista igual, y tenés
que ir a **GitHub > Actions > build-windows-installer > Run workflow** a
mano, y bajar el artefacto `LICS-Setup` cuando termine.

> Nota: esto es un solo comando, pero cruza dos máquinas (la Mac donde se
> compilan las imágenes y esta Windows) — no hay forma de que sea un único
> paso sin infraestructura nueva. Ver la sección "Cómo se genera la imagen
> dorada" en `infra/windows/README.md` si es la primera vez que hacés esto
> en esta máquina (requiere el runner self-hosted ya registrado una vez).

---

## Paso 3 — Instalar en la máquina del cliente

Con el `.exe` (`LICS-Setup`) ya en la máquina destino:

1. Correr el instalador. Importa la distro WSL2 y registra las tareas
   programadas de inicio.
2. Abrir el ícono **LICS** del escritorio. Primera vez: pantalla de
   "Iniciando…" mientras arrancan los servicios dentro de WSL2.
3. **Credenciales iniciales.** Se genera un usuario `admin` con contraseña
   aleatoria al construir la imagen dorada (en el Paso 2, distinta en cada
   build). Para verla:
   ```powershell
   wsl -d lics-wsl -- sudo cat /opt/lics/ADMIN_CREDENTIALS_INICIALES.txt
   ```
4. **Cambiar esa contraseña de inmediato** desde dentro de la app (o crear
   tu propio usuario administrador y desactivar `admin`). Todas las
   instalaciones hechas desde esta misma imagen dorada comparten esa
   contraseña hasta que se cambie.

---

## Paso 4 — Correr la migración de datos legacy DBF

Con la app ya instalada y funcionando, copiá la carpeta con los `.DBF`
reales del cliente a esta Windows — tiene que quedar en un lugar visible
desde WSL2 (por ejemplo `C:\lics-dev\invent\`, que WSL2 ve como
`/mnt/c/lics-dev/invent`).

La carpeta debe tener la misma forma que entregó el cliente:

```
invent/
  INVEN01.DBF  INVEN03.DBF  INVEN05.DBF  INVEN08.DBF   <- copia "raíz"
  bases1/
    INVEN01.DBF  INVEN03.DBF  INVEN05.DBF  INVEN08.DBF <- copia "bases1"
```

Corré:

```powershell
wsl -d lics-wsl -- /opt/lics/scripts/migrate-legacy-dbf.sh /mnt/c/lics-dev/invent
```

El script (`scripts/migrate-legacy-dbf.sh`, ya viene incluido en la app
porque se commiteó y empaquetó en el Paso 1) hace todo en un solo comando:
valida que estén los 8 archivos, **te pide confirmación explícita**, crea
un **respaldo completo de la base antes de tocar nada**, copia los `.DBF`
dentro del contenedor, y corre extracción → validación → importación →
reporte, en ese orden. Al final te muestra el reporte con los totales
reales (proveedores, productos, compras importadas, huérfanos, errores
bloqueantes).

Es **seguro correrlo de nuevo** si algo falla a mitad de camino — no
duplica lo que ya se importó.

Detalle completo de qué hace cada paso, qué se decidió sobre los datos
legacy (por qué se descartaron las ventas, cómo se resuelve la ubicación,
etc.) y qué esperar en el reporte: [dbf-migration-closure.md](dbf-migration-closure.md).

---

## Paso 5 — Verificación final antes de dejarlo en manos del cliente

- Entrá a la app con el usuario admin (ya con la contraseña cambiada) y
  confirmá que los productos/proveedores/compras migrados se ven bien.
- Revisá la lista de productos en la ubicación `SINUB` — son los que
  quedaron sin ubicación detectada, para ir asignándoles una real a medida
  que los encuentren físicamente en la bodega.
- Confirmá que el backup automático y el watchdog están corriendo (ver
  checklist en [windows-production-checklist.md](windows-production-checklist.md)).
- A partir de acá, cualquier cambio de Django/Next a esta instalación se
  hace con el menú **LICS > Actualizar aplicación (Django/Next)…** — nunca
  reinstalando el `.exe` (eso no actualiza el backend/frontend, ver
  `infra/windows/README.md`, sección "Actualizar la aplicación").

---

## Resumen de comandos (todo junto, en orden)

```bash
# 1. En este repo (Mac), después de revisar y commitear todo:
./scripts/build-offline-release.sh
# copiar release/lics-<version>-linux-amd64/ a C:\lics-dev\ en la Windows
```

```powershell
# 2. En la Windows de build:
cd infra\windows\wsl
.\cut-release.ps1
# instalar el .exe resultante en la máquina del cliente
```

```powershell
# 3. En la máquina del cliente, después de instalar el .exe:
wsl -d lics-wsl -- sudo cat /opt/lics/ADMIN_CREDENTIALS_INICIALES.txt
# entrar a la app, cambiar la contraseña

# 4. Con los .DBF reales copiados a C:\lics-dev\invent\:
wsl -d lics-wsl -- /opt/lics/scripts/migrate-legacy-dbf.sh /mnt/c/lics-dev/invent
```
