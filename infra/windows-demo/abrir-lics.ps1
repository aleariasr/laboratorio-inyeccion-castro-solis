# Instala/arranca LICS en Windows para demo con el cliente.
#
# Este script:
# - se auto-eleva (UAC) si hace falta;
# - habilita WSL2 si no esta habilitado (puede pedir reinicio);
# - instala Docker Desktop si no esta instalado;
# - carga las imagenes offline (.tar) de infra/windows-demo/../../images;
# - genera infra/docker/.env.prod con secretos aleatorios si no existe;
# - corre migraciones, roles base y crea un usuario administrador (idempotente);
# - levanta todos los servicios y abre el navegador.
#
# Se puede volver a ejecutar cuantas veces se quiera: no repite pasos
# ya hechos y no borra datos existentes.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AdminUser = "admin"
$AdminPassword = "Demo2026!"

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

# --- Rutas -------------------------------------------------------------------

$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ReleaseRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$DockerDir = Join-Path $AppRoot "infra\docker"
$ComposeFile = Join-Path $DockerDir "compose.prod.yml"
$EnvExample = Join-Path $DockerDir ".env.prod.example"
$EnvFile = Join-Path $DockerDir ".env.prod"
$ImagesDir = Join-Path $ReleaseRoot "images"
$VersionFile = Join-Path $AppRoot "VERSION"

Log-Info "Carpeta de la aplicacion: $AppRoot"
Log-Info "Carpeta de imagenes:      $ImagesDir"

# --- Utilidades ---------------------------------------------------------------

function Test-PendingReboot {
    $a = Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending"
    $b = Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"
    $c = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager" -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
    return ($a -or $b -or ($null -ne $c))
}

function Refresh-Path {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function New-RandomHex([int]$Bytes = 32) {
    $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
    $buffer = New-Object byte[] $Bytes
    $rng.GetBytes($buffer)
    -join ($buffer | ForEach-Object { $_.ToString("x2") })
}

function Set-EnvValue([string]$Path, [string]$Key, [string]$Value) {
    $lines = Get-Content -Path $Path
    $found = $false
    $newLines = foreach ($line in $lines) {
        if ($line -match "^$Key=") { $found = $true; "$Key=$Value" }
        else { $line }
    }
    if (-not $found) { $newLines += "$Key=$Value" }
    Set-Content -Path $Path -Value $newLines
}

function Test-PortFree([int]$Port) {
    $inUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return (-not $inUse)
}

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CArgs)
    & docker compose --env-file $EnvFile --file $ComposeFile @CArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($CArgs -join ' ') fallo (codigo $LASTEXITCODE)."
    }
}

function Wait-ContainerHealthy([string]$Service, [int]$TimeoutSeconds = 180) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $cid = ((& docker compose --env-file $EnvFile --file $ComposeFile ps -q $Service) | Select-Object -First 1)
        if ($cid) {
            $status = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $cid).Trim()
            if ($status -eq "healthy") { return }
            if ($status -in @("unhealthy", "exited", "dead")) {
                throw "El servicio $Service quedo en estado $status."
            }
        }
        Start-Sleep -Seconds 2
    }
    throw "El servicio $Service no quedo saludable a tiempo."
}

function Wait-Http([string]$Url, [int]$TimeoutSeconds = 120) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -eq 200) { return }
        } catch {}
        Start-Sleep -Seconds 2
    }
    throw "Sin respuesta HTTP 200 en $Url"
}

# --- Paso 1: WSL2 --------------------------------------------------------------

Log-Info "Verificando WSL2..."
& wsl --install --no-distribution 2>$null | Out-Null

if (Test-PendingReboot) {
    Log-Warn "Windows necesita reiniciarse para terminar de habilitar WSL2."
    Log-Warn "Reinicia la computadora y vuelve a ejecutar Abrir-LICS.bat. Este mismo archivo continua donde quedo."
    Read-Host "Presiona Enter para cerrar"
    exit 1
}

# --- Paso 2: Docker Desktop ------------------------------------------------------

Refresh-Path
$dockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Log-Info "Docker Desktop no esta instalado. Descargando instalador..."
    $installerPath = Join-Path $env:TEMP "DockerDesktopInstaller.exe"
    Invoke-WebRequest -Uri "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" -OutFile $installerPath

    Log-Info "Instalando Docker Desktop (silencioso)..."
    Start-Process -FilePath $installerPath -ArgumentList "install", "--quiet", "--accept-license" -Wait

    Refresh-Path

    if (Test-PendingReboot) {
        Log-Warn "Windows necesita reiniciarse tras instalar Docker Desktop."
        Log-Warn "Reinicia la computadora y vuelve a ejecutar Abrir-LICS.bat."
        Read-Host "Presiona Enter para cerrar"
        exit 1
    }

    Log-Ok "Docker Desktop instalado."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "No se encontro el comando docker tras la instalacion. Revisa manualmente."
}

# --- Paso 3: arrancar el motor de Docker -----------------------------------------

$dockerReady = $false
try { & docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerReady = $true } } catch {}

if (-not $dockerReady) {
    Log-Info "Iniciando Docker Desktop..."
    if (Test-Path $dockerDesktopExe) {
        Start-Process -FilePath $dockerDesktopExe
    }

    Log-Info "Esperando a que el motor de Docker responda (puede tardar hasta 3 minutos la primera vez)..."
    $deadline = (Get-Date).AddSeconds(240)
    while ((Get-Date) -lt $deadline) {
        try {
            & docker info *> $null
            if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
        } catch {}
        Start-Sleep -Seconds 3
    }

    if (-not $dockerReady) {
        throw "Docker Desktop no respondio a tiempo. Abrelo manualmente y vuelve a correr este archivo."
    }
}

Log-Ok "Docker esta corriendo."

# --- Paso 4: cargar imagenes offline ----------------------------------------------

$imageTars = Get-ChildItem -Path $ImagesDir -Filter "*.tar" -File -ErrorAction SilentlyContinue

if (-not $imageTars -or $imageTars.Count -ne 4) {
    throw "Se esperaban 4 imagenes .tar en $ImagesDir y se encontraron $($imageTars.Count). Revisa el paquete."
}

foreach ($tar in $imageTars) {
    Log-Info "Cargando imagen: $($tar.Name)"
    & docker image load --input $tar.FullName
    if ($LASTEXITCODE -ne 0) { throw "No se pudo cargar $($tar.Name)." }
}

Log-Ok "Imagenes cargadas."

# --- Paso 5: generar infra/docker/.env.prod ------------------------------------

if (-not (Test-Path $EnvFile)) {
    Log-Info "Generando infra\docker\.env.prod ..."

    $HttpPort = 80
    if (-not (Test-PortFree 80)) {
        Log-Warn "El puerto 80 esta ocupado. Se usara el puerto 8080."
        $HttpPort = 8080
    }

    Copy-Item $EnvExample $EnvFile

    $version = (Get-Content $VersionFile -Raw).Trim()
    $pgPassword = New-RandomHex 32
    $secretKey = New-RandomHex 32

    Set-EnvValue $EnvFile "LICS_VERSION" $version
    Set-EnvValue $EnvFile "POSTGRES_PASSWORD" $pgPassword
    Set-EnvValue $EnvFile "DJANGO_SECRET_KEY" $secretKey
    Set-EnvValue $EnvFile "HTTP_PORT" $HttpPort

    if ($HttpPort -ne 80) {
        Set-EnvValue $EnvFile "DJANGO_CSRF_TRUSTED_ORIGINS" "http://localhost:$HttpPort,http://127.0.0.1:$HttpPort"
    }

    if (Select-String -Path $EnvFile -Pattern "REEMPLAZAR_" -Quiet) {
        throw "infra\docker\.env.prod todavia contiene valores REEMPLAZAR_."
    }

    Log-Ok "Configuracion generada."
} else {
    Log-Info "infra\docker\.env.prod ya existe, no se vuelve a generar."
}

$HttpPort = ((Get-Content $EnvFile | Where-Object { $_ -match "^HTTP_PORT=" }) -replace "^HTTP_PORT=", "").Trim()
if (-not $HttpPort) { $HttpPort = 80 }
$AppUrl = "http://localhost:$HttpPort"

# --- Paso 6: base de datos ------------------------------------------------------

Log-Info "Iniciando PostgreSQL..."
Invoke-Compose up --detach --no-build --pull never postgres
Wait-ContainerHealthy -Service "postgres"
Log-Ok "PostgreSQL saludable."

Log-Info "Aplicando migraciones..."
Invoke-Compose run --rm --no-deps backend python src/manage.py migrate --noinput

Log-Info "Creando roles base..."
Invoke-Compose run --rm --no-deps backend python src/manage.py setup_roles

Log-Info "Verificando usuario administrador..."
$adminScript = @"
from django.contrib.auth.models import User
if not User.objects.filter(username="$AdminUser").exists():
    User.objects.create_superuser("$AdminUser", "admin@lics.local", "$AdminPassword")
    print("Usuario administrador creado.")
else:
    print("Usuario administrador ya existia.")
"@
$tmpScript = Join-Path $env:TEMP "lics-create-admin.py"
Set-Content -Path $tmpScript -Value $adminScript -Encoding UTF8
Get-Content $tmpScript -Raw | & docker compose --env-file $EnvFile --file $ComposeFile run --rm -T --no-deps backend python src/manage.py shell
if ($LASTEXITCODE -ne 0) { throw "No se pudo verificar/crear el usuario administrador." }
Remove-Item $tmpScript -ErrorAction SilentlyContinue

Log-Ok "Base de datos lista (vacia, solo roles y usuario admin)."

# --- Paso 7: levantar todo y abrir el navegador ----------------------------------

Log-Info "Iniciando todos los servicios..."
Invoke-Compose up --detach --no-build --pull never

Log-Info "Esperando a que la aplicacion responda..."
Wait-Http -Url "$AppUrl/api/health/"

Log-Ok "LICS esta corriendo."
Write-Host ""
Write-Host "=================================================="
Write-Host " LICS listo"
Write-Host " URL:      $AppUrl"
Write-Host " Usuario:  $AdminUser"
Write-Host " Password: $AdminPassword"
Write-Host "=================================================="
Write-Host ""

Start-Process $AppUrl

Read-Host "Presiona Enter para cerrar esta ventana (la aplicacion sigue corriendo)"