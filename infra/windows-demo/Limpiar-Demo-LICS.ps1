# Limpiar-Demo-LICS.ps1
#
# Deja una computadora que tenia el demo de LICS (infra/windows-demo, los
# dos .bat con Docker Desktop) lista para instalar la app nativa
# (Electron + WSL2 + Docker Engine) sin que las dos convivan mal.
#
# Que hace, en orden:
#   1. Baja los contenedores del demo (docker compose down), no solo los
#      pausa.
#   2. Verifica si Docker Desktop sigue instalado. Si sigue, PARA ACA y te
#      pide desinstalarlo a mano (Configuracion > Aplicaciones) -- no lo
#      desinstala solo, porque un uninstall automatico que falle a medias
#      es peor que pedirte un clic. Volves a correr el script despues.
#   3. Si Docker Desktop ya no esta, revisa y borra las distros WSL2
#      huerfanas que deja (docker-desktop, docker-desktop-data) -- no
#      tienen nada que ver con los datos de LICS.
#   4. Confirma que el puerto 80 (y el 8080) quedaron libres.
#   5. Te pregunta si queres borrar la carpeta del demo, y recien ahi la
#      borra (pide que escribas BORRAR para confirmar).
#
# Se puede correr mas de una vez sin problema: cada paso se salta solo si
# ya esta hecho.
#
# COMO USARLO:
#   1. Editar la variable $DemoRoot de aca abajo con la ruta real donde
#      esta el release que usaste para el demo (la carpeta que tiene
#      "infra\docker" adentro -- normalmente donde descomprimiste el
#      release, ej. C:\lics-demo\lics-0.9.0-linux-amd64\app).
#   2. Clic derecho sobre este archivo > "Ejecutar con PowerShell", o
#      abrir PowerShell como Administrador y correr:
#      .\Limpiar-Demo-LICS.ps1

# ============================================================================
# EDITAR ACA: ruta real de la carpeta del release usada para el demo.
# ============================================================================
$DemoRoot = "C:\RUTA\A\TU\CARPETA\DEL\DEMO"

# ============================================================================
# A partir de aca no hace falta tocar nada.
# ============================================================================

$ErrorActionPreference = "Stop"

function Log-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Log-Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Log-Warn($msg) { Write-Host "[ADVERTENCIA] $msg" -ForegroundColor Yellow }
function Log-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# --- Auto-elevacion ---------------------------------------------------------

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Log-Info "Se necesitan permisos de administrador. Pidiendo autorizacion..."
    Start-Process powershell -Verb RunAs -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`""
    )
    exit
}

$LogPath = Join-Path $env:TEMP ("lics-limpieza-demo-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
Start-Transcript -Path $LogPath -Append | Out-Null

try {

Write-Host ""
Write-Host "=================================================="
Write-Host " Limpieza del demo de LICS antes de instalar la app nativa"
Write-Host "=================================================="
Write-Host ""

# --- Paso 1: bajar los contenedores del demo --------------------------------

$DockerDir = Join-Path $DemoRoot "infra\docker"
$ComposeFile = Join-Path $DockerDir "compose.prod.yml"
$EnvFile = Join-Path $DockerDir ".env.prod"

Log-Info "Paso 1: bajar los contenedores del demo"

if ($DemoRoot -eq "C:\RUTA\A\TU\CARPETA\DEL\DEMO") {
    Log-Warn "No editaste `$DemoRoot al principio de este archivo -- no se puede ubicar el demo."
    Log-Warn "Abri este .ps1 con un editor de texto, cambia la variable `$DemoRoot por la ruta real, y volve a correrlo."
    Log-Warn "Mientras tanto se salta el paso 1 (bajar contenedores) y se sigue con el resto."
} elseif (-not (Test-Path $ComposeFile)) {
    Log-Warn "No se encontro $ComposeFile -- se salta el paso 1."
    Log-Warn "Revisa que `$DemoRoot apunte a la carpeta correcta (debe tener infra\docker adentro)."
} elseif (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Log-Info "El comando 'docker' ya no esta disponible (Docker Desktop ya se desinstalo). Nada que bajar."
} else {
    try {
        & docker compose --env-file $EnvFile --file $ComposeFile down
        if ($LASTEXITCODE -eq 0) {
            Log-Ok "Contenedores del demo bajados (down). Los volumenes de datos del demo se conservaron."
        } else {
            Log-Warn "docker compose down termino con codigo $LASTEXITCODE -- revisa el mensaje de arriba."
        }
    } catch {
        Log-Warn "No se pudo correr docker compose down: $($_.Exception.Message)"
    }
}

Write-Host ""

# --- Paso 2: Docker Desktop debe estar desinstalado -------------------------

Log-Info "Paso 2: verificar que Docker Desktop este desinstalado"

function Get-DockerDesktopInstall {
    $paths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    foreach ($p in $paths) {
        Get-ItemProperty -Path $p -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like "Docker Desktop*" }
    }
}

$dockerInstall = Get-DockerDesktopInstall

if ($dockerInstall) {
    Log-Err "Docker Desktop TODAVIA esta instalado."
    Write-Host ""
    Log-Warn "Este script no lo desinstala solo (un uninstall automatico que falle a medias deja las cosas peor)."
    Log-Warn "Desinstalalo a mano: Configuracion de Windows > Aplicaciones > Docker Desktop > Desinstalar."
    Log-Warn "Cuando termines, volve a correr este mismo script -- los pasos ya hechos no se repiten."
    Write-Host ""
    Log-Info "Registro de esta corrida: $LogPath"
    Read-Host "Presiona Enter para cerrar"
    Stop-Transcript | Out-Null
    exit 1
}

Log-Ok "Docker Desktop no esta instalado."
Write-Host ""

# --- Paso 3: distros WSL2 huerfanas de Docker Desktop -----------------------

Log-Info "Paso 3: revisar distros WSL2 huerfanas de Docker Desktop"

$wslList = & wsl -l -v 2>$null
$orphanNames = @("docker-desktop", "docker-desktop-data")
$foundOrphans = @()

foreach ($name in $orphanNames) {
    if ($wslList -match [regex]::Escape($name)) {
        $foundOrphans += $name
    }
}

if ($foundOrphans.Count -eq 0) {
    Log-Ok "No quedaron distros huerfanas de Docker Desktop."
} else {
    foreach ($name in $foundOrphans) {
        Log-Info "Borrando distro huerfana '$name' (no tiene datos de LICS)..."
        & wsl --unregister $name
        if ($LASTEXITCODE -eq 0) {
            Log-Ok "'$name' eliminada."
        } else {
            Log-Warn "No se pudo eliminar '$name' automaticamente (codigo $LASTEXITCODE). Revisa 'wsl -l -v' a mano."
        }
    }
}

Write-Host ""

# --- Paso 4: puertos 80 / 8080 ----------------------------------------------

Log-Info "Paso 4: confirmar que los puertos 80 y 8080 quedaron libres"

foreach ($port in @(80, 8080)) {
    $inUse = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($inUse) {
        Log-Warn "El puerto $port sigue ocupado. Detalle:"
        $inUse | Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table | Out-String | Write-Host
    } else {
        Log-Ok "Puerto $port libre."
    }
}

Write-Host ""

# --- Paso 5: borrar la carpeta del demo -------------------------------------

Log-Info "Paso 5: borrar la carpeta del demo"

if ($DemoRoot -eq "C:\RUTA\A\TU\CARPETA\DEL\DEMO" -or -not (Test-Path $DemoRoot)) {
    Log-Warn "No se encontro una carpeta valida en `$DemoRoot ('$DemoRoot') -- se salta el borrado automatico."
    Log-Warn "Borrala vos a mano cuando confirmes la ruta correcta: es un simple borrado de carpeta, sin riesgo."
} else {
    Write-Host ""
    Log-Warn "Se va a borrar por completo esta carpeta:"
    Write-Host "    $DemoRoot" -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Escribi BORRAR (en mayusculas) para confirmar, o cualquier otra cosa para cancelar este paso"
    if ($confirm -ceq "BORRAR") {
        Remove-Item -Path $DemoRoot -Recurse -Force
        Log-Ok "Carpeta del demo borrada."
    } else {
        Log-Warn "Borrado cancelado. La carpeta del demo sigue en $DemoRoot -- podes borrarla a mano cuando quieras."
    }
}

Write-Host ""
Write-Host "=================================================="
Write-Host " Limpieza terminada"
Write-Host "=================================================="
Write-Host ""
Log-Info "Registro completo de esta corrida: $LogPath"
Write-Host ""
Log-Info "Si todos los pasos de arriba salieron OK, la maquina ya esta lista para instalar el .exe de la app nativa."

Read-Host "Presiona Enter para cerrar esta ventana"

}
catch {
    Write-Host ""
    Log-Err "La limpieza se interrumpio por un error."
    Log-Err $_.Exception.Message

    if ($_.InvocationInfo -and $_.InvocationInfo.PositionMessage) {
        Write-Host ""
        Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "Registro completo de esta ejecucion: $LogPath" -ForegroundColor Yellow
    Write-Host ""

    Read-Host "Presiona Enter para cerrar esta ventana"

    Stop-Transcript | Out-Null
    exit 1
}

Stop-Transcript | Out-Null