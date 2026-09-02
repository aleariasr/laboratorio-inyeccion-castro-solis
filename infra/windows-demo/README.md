# LICS — demo histórica en Windows (descontinuada)

> **Estado: histórico, no usado en producción.** Esta carpeta documenta la
> **primera** prueba de LICS corriendo en Windows, hecha para mostrarle al
> cliente que el sistema podía funcionar en esa plataforma antes de tomar
> la decisión de migrar toda la infraestructura productiva a Windows. Esa
> decisión ya se tomó y ya se implementó — ver
> [`infra/windows/README.md`](../windows/README.md) y
> [`docs/windows-desktop-stage-closure.md`](../../docs/windows-desktop-stage-closure.md)
> para la arquitectura vigente (WSL2 + Docker Engine + Electron). Esta
> carpeta **ya no se despliega ni se usa en ningún lado**; se conserva en el
> repositorio solo como referencia de cómo empezó esa exploración.

## Qué es esto

Antes de comprometerse a migrar LICS de Linux a Windows, se armó una prueba
rápida para validar con el cliente que el sistema podía correr en una
computadora Windows sin mayor ceremonia: doble clic en un `.bat`, esperar,
y quedar con la aplicación abierta en el navegador.

Esa prueba es arquitectónicamente distinta de la solución actual:

- Usa **Docker Desktop** directo sobre Windows (instalándolo si hace
  falta), no WSL2 con Docker Engine corriendo dentro de una distro Linux
  propia (`lics-wsl`) como hace la app de escritorio actual.
- No tiene app de Electron ni ventana nativa: abre la aplicación en el
  navegador por defecto de Windows contra `http://localhost` (o
  `:8080` si el puerto 80 está ocupado).
- No tiene imagen dorada, instalador `.exe`, runner self-hosted de GitHub
  Actions, tarea programada de Windows ni actualización remota — es un
  script PowerShell autocontenido pensado para correrse una sola vez a
  mano en la máquina de la demo.

## Archivos de esta carpeta

- **`Abrir-LICS.bat`** / **`abrir-lics.ps1`**: instala/arranca la demo.
  Habilita WSL2 si falta, instala Docker Desktop si falta, carga las
  imágenes `.tar` offline, genera `infra/docker/.env.prod` con secretos
  aleatorios (excepto la contraseña del administrador — ver más abajo),
  corre migraciones y roles base, crea un usuario administrador
  (idempotente) y abre el navegador.
- **`Detener-LICS.bat`**: corre `docker compose ... stop` sobre
  `infra/docker/compose.prod.yml` para pausar los contenedores de la demo.
- **`Limpiar-Demo-LICS.ps1`**: script de desmantelamiento, ya usado para
  dejar la máquina de la demo lista para instalar la app nativa actual —
  baja los contenedores de la demo, verifica que Docker Desktop se haya
  desinstalado a mano, borra las distros WSL2 huérfanas que deja Docker
  Desktop (`docker-desktop`, `docker-desktop-data`), confirma que los
  puertos 80/8080 quedaron libres y, con confirmación explícita, borra la
  carpeta del release usado para la demo. Este script es en sí mismo la
  prueba de que la demo ya fue decomisionada en la práctica.

Ninguno de estos scripts se modifica como parte de esta documentación —
quedan tal cual están, como estaban cuando se usaron.

## Credencial hardcodeada — no reutilizar

`abrir-lics.ps1` crea el usuario administrador inicial con una contraseña
**fija y hardcodeada en el script**:

```powershell
$AdminPassword = "Demo2026!"
```

Esto es un artefacto conocido de esta demo ya descontinuada, aceptable en
su momento porque era una prueba puntual, de corta duración, en una sola
máquina controlada, luego desmantelada con `Limpiar-Demo-LICS.ps1`. **No es
el modelo a seguir** — contrasta a propósito con la app de escritorio
actual, donde `provision-golden-image.sh` genera la contraseña del
administrador inicial de forma aleatoria (`openssl rand -base64 24`) en
cada imagen dorada (ver `CHANGELOG.md` y
`docs/windows-desktop-stage-closure.md`).

Esta contraseña **nunca debe reutilizarse** en ningún entorno real, ni
siquiera de prueba. Si esta carpeta llegara a necesitarse otra vez por
cualquier motivo, debe reconstruirse generando/rotando la credencial del
administrador de la misma forma que la imagen dorada actual, no
reutilizando `"Demo2026!"`.
